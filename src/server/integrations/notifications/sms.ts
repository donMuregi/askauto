import { uuidv7 } from "uuidv7";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordDevOutboxEntry } from "./dev-store";
import type { DeliverySendResult, SmsMessage, SmsProvider } from "./types";

export class AfricasTalkingSmsProvider implements SmsProvider {
  readonly channel = "sms" as const;

  async send(input: SmsMessage): Promise<DeliverySendResult> {
    const env = getEnv();
    if (!input.to.startsWith("+254")) {
      return {
        providerMessageId: "",
        status: "failed",
        hardFailure: true,
        error: "Only Kenyan (+254) mobile numbers are supported.",
      };
    }

    const endpoint =
      env.NODE_ENV === "production"
        ? "https://api.africastalking.com/version1/messaging"
        : "https://api.sandbox.africastalking.com/version1/messaging";

    const body = new URLSearchParams({
      username: env.AT_USERNAME ?? "",
      to: input.to,
      message: input.message,
      from: env.AT_SENDER_ID,
    });

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          apiKey: env.AT_API_KEY ?? "",
        },
        body: body.toString(),
      });

      if (!response.ok) {
        return {
          providerMessageId: "",
          status: "failed",
          hardFailure: response.status >= 400 && response.status < 500,
          error: `Africa's Talking HTTP ${response.status}`,
        };
      }

      const data = (await response.json()) as {
        SMSMessageData?: {
          Recipients?: Array<{ statusCode?: number; status?: string; messageId?: string }>;
        };
      };

      const recipient = data.SMSMessageData?.Recipients?.[0];
      if (!recipient || (recipient.statusCode && recipient.statusCode !== 101 && recipient.statusCode !== 100)) {
        return {
          providerMessageId: recipient?.messageId ?? "",
          status: "failed",
          hardFailure: recipient?.statusCode === 403 || recipient?.statusCode === 405,
          error: recipient?.status ?? "SMS rejected by provider",
        };
      }

      return {
        providerMessageId: recipient.messageId ?? uuidv7(),
        status: "sent",
      };
    } catch (err) {
      return {
        providerMessageId: "",
        status: "failed",
        error: err instanceof Error ? err.message : "SMS send failed",
      };
    }
  }
}

export class FakeSmsProvider implements SmsProvider {
  readonly channel = "sms" as const;

  async send(input: SmsMessage): Promise<DeliverySendResult> {
    const env = getEnv();
    const entry = recordDevOutboxEntry({
      channel: "sms",
      to: input.to,
      purpose: input.purpose,
      bodyText: input.message,
    });

    // Print OTPs to server log strictly when INTEGRATIONS_MODE=fake and non-production
    if (env.INTEGRATIONS_MODE === "fake" && env.NODE_ENV === "development") {
      console.info(`[DEV SMS][${input.purpose}] to=${input.to} message="${input.message}"`);
    } else {
      logger.info({ purpose: input.purpose, outboxId: entry.id }, "fake sms recorded");
    }

    return {
      providerMessageId: `fake-sms-${entry.id}`,
      status: "sent",
    };
  }
}

export function getSmsProvider(): SmsProvider {
  return getEnv().INTEGRATIONS_MODE === "real"
    ? new AfricasTalkingSmsProvider()
    : new FakeSmsProvider();
}
