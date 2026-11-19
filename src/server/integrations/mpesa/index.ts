import { formatInTimeZone } from "date-fns-tz";
import { uuidv7 } from "uuidv7";
import { getEnv } from "@/lib/env";
import { NAIROBI_TIMEZONE } from "@/lib/format";

export interface StkPushRequest {
  amountKes: number;
  phoneE164: string;
  accountReference: string;
  description: string;
}

export interface StkPushResponse {
  checkoutRequestId: string;
  merchantRequestId: string;
  customerMessage: string;
}

export interface StkQueryResponse {
  resultCode: string;
  resultDesc: string;
  mpesaReceipt?: string;
}

export interface MpesaProvider {
  initiateStkPush(input: StkPushRequest): Promise<StkPushResponse>;
  queryStkStatus(checkoutRequestId: string): Promise<StkQueryResponse>;
}

export function formatMpesaPhone(e164: string): string {
  return e164.replace(/^\+/, "");
}

export function friendlyMpesaResultMessage(resultCode: string | number): string {
  const code = String(resultCode);
  switch (code) {
    case "0":
      return "Payment confirmed.";
    case "1032":
      return "You cancelled the M-Pesa prompt. Retry when ready.";
    case "1037":
      return "The M-Pesa prompt timed out before PIN entry. Retry to receive a new prompt.";
    case "2001":
      return "Incorrect M-Pesa PIN entered. Retry payment.";
    case "1":
      return "Insufficient M-Pesa balance. Top up and retry payment.";
    default:
      return "M-Pesa payment could not be completed. Retry or pay via Paybill 880100.";
  }
}

export class FakeMpesaProvider implements MpesaProvider {
  async initiateStkPush(input: StkPushRequest): Promise<StkPushResponse> {
    const suffix = uuidv7().replace(/-/g, "").slice(0, 12).toUpperCase();
    return {
      checkoutRequestId: `ws_CO_FAKE_${suffix}`,
      merchantRequestId: `MR_FAKE_${suffix}`,
      customerMessage: `Check your phone (${input.phoneE164}) and enter your M-Pesa PIN.`,
    };
  }

  async queryStkStatus(checkoutRequestId: string): Promise<StkQueryResponse> {
    return {
      resultCode: "0",
      resultDesc: "The service request is processed successfully.",
      mpesaReceipt: `FAKE${checkoutRequestId.slice(-6).toUpperCase()}`,
    };
  }
}

export class DarajaMpesaProvider implements MpesaProvider {
  private cachedToken: { token: string; expiresAt: number } | null = null;

  private getBaseUrl(): string {
    return getEnv().MPESA_ENV === "production"
      ? "https://api.safaricom.co.ke"
      : "https://sandbox.safaricom.co.ke";
  }

  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt - 60_000) {
      return this.cachedToken.token;
    }

    const env = getEnv();
    const creds = Buffer.from(
      `${env.MPESA_CONSUMER_KEY ?? ""}:${env.MPESA_CONSUMER_SECRET ?? ""}`,
    ).toString("base64");

    const res = await fetch(
      `${this.getBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`,
      {
        headers: { Authorization: `Basic ${creds}` },
      },
    );
    if (!res.ok) {
      throw new Error(`Daraja OAuth failed: HTTP ${res.status}`);
    }
    const data = (await res.json()) as { access_token: string; expires_in?: string };
    const expiresSec = Number.parseInt(data.expires_in ?? "3599", 10);
    this.cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + expiresSec * 1000,
    };
    return data.access_token;
  }

  async initiateStkPush(input: StkPushRequest): Promise<StkPushResponse> {
    const env = getEnv();
    const token = await this.getAccessToken();
    const timestamp = formatInTimeZone(new Date(), NAIROBI_TIMEZONE, "yyyyMMddHHmmss");
    const password = Buffer.from(
      `${env.MPESA_SHORTCODE}${env.MPESA_PASSKEY ?? ""}${timestamp}`,
    ).toString("base64");
    const phone = formatMpesaPhone(input.phoneE164);

    const res = await fetch(`${this.getBaseUrl()}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: input.amountKes,
        PartyA: phone,
        PartyB: env.MPESA_SHORTCODE,
        PhoneNumber: phone,
        CallBackURL: `${env.APP_URL}/api/webhooks/mpesa/stk/${env.MPESA_CALLBACK_SECRET}`,
        AccountReference: input.accountReference.slice(0, 12),
        TransactionDesc: input.description,
      }),
    });

    if (!res.ok) {
      throw new Error(`Daraja STK Push failed: HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      CheckoutRequestID: string;
      MerchantRequestID: string;
      CustomerMessage?: string;
    };

    return {
      checkoutRequestId: data.CheckoutRequestID,
      merchantRequestId: data.MerchantRequestID,
      customerMessage: data.CustomerMessage ?? "Check your phone and enter your M-Pesa PIN.",
    };
  }

  async queryStkStatus(checkoutRequestId: string): Promise<StkQueryResponse> {
    const env = getEnv();
    const token = await this.getAccessToken();
    const timestamp = formatInTimeZone(new Date(), NAIROBI_TIMEZONE, "yyyyMMddHHmmss");
    const password = Buffer.from(
      `${env.MPESA_SHORTCODE}${env.MPESA_PASSKEY ?? ""}${timestamp}`,
    ).toString("base64");

    const res = await fetch(`${this.getBaseUrl()}/mpesa/stkpushquery/v1/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        BusinessShortCode: env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      }),
    });

    if (!res.ok) {
      throw new Error(`Daraja STK Query failed: HTTP ${res.status}`);
    }

    const data = (await res.json()) as { ResultCode: string | number; ResultDesc: string };
    return {
      resultCode: String(data.ResultCode),
      resultDesc: data.ResultDesc,
    };
  }
}

export function getMpesaProvider(): MpesaProvider {
  return getEnv().INTEGRATIONS_MODE === "real"
    ? new DarajaMpesaProvider()
    : new FakeMpesaProvider();
}
