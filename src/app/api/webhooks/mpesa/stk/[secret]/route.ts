import { NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { processStkCallbackService } from "@/server/domain/applications/service";
import { getMpesaProvider } from "@/server/integrations/mpesa";

const stkCallbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string(),
      CheckoutRequestID: z.string(),
      ResultCode: z.union([z.number(), z.string()]),
      ResultDesc: z.string(),
      CallbackMetadata: z
        .object({
          Item: z.array(
            z.object({
              Name: z.string(),
              Value: z.union([z.string(), z.number()]).optional(),
            }),
          ),
        })
        .optional(),
    }),
  }),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ secret: string }> },
) {
  const env = getEnv();
  const { secret } = await context.params;
  if (secret !== env.MPESA_CALLBACK_SECRET) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = stkCallbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid callback shape" }, { status: 400 });
  }

  const cb = parsed.data.Body.stkCallback;
  const items = cb.CallbackMetadata?.Item ?? [];
  const getItem = (name: string) => items.find((i) => i.Name === name)?.Value;

  let resultCode = String(cb.ResultCode);
  let resultDesc = cb.ResultDesc;
  const amountRaw = getItem("Amount");
  const mpesaReceipt = getItem("MpesaReceiptNumber");

  // Confirm with STK Query API before marking paid
  if (resultCode === "0") {
    try {
      const query = await getMpesaProvider().queryStkStatus(cb.CheckoutRequestID);
      resultCode = query.resultCode;
      resultDesc = query.resultDesc;
    } catch (err) {
      logger.error({ err }, "stk query verification failed");
      return NextResponse.json({ error: "STK Query verification failed" }, { status: 502 });
    }
  }

  await processStkCallbackService({
    checkoutRequestId: cb.CheckoutRequestID,
    resultCode,
    resultDesc,
    amountKes: amountRaw !== undefined ? Number(amountRaw) : undefined,
    mpesaReceipt: mpesaReceipt ? String(mpesaReceipt) : undefined,
    rawCallback: body,
  });

  return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
}
