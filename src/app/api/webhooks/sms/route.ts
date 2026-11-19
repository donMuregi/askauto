import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getDb } from "@/server/db/client";
import { notificationDeliveries } from "@/server/db/schema";

const smsWebhookSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  failureReason: z.string().optional(),
});

export async function POST(request: Request) {
  const env = getEnv();
  const secretHeader = request.headers.get("x-sms-webhook-secret");

  if (env.INTEGRATIONS_MODE === "real") {
    if (!env.AT_API_KEY || secretHeader !== env.AT_API_KEY) {
      return NextResponse.json({ error: "Unauthorised webhook request" }, { status: 401 });
    }
  }

  let payload: Record<string, unknown>;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = await request.formData();
      payload = Object.fromEntries(form.entries());
    } else {
      payload = (await request.json()) as Record<string, unknown>;
    }
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const parsed = smsWebhookSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid SMS delivery report" }, { status: 400 });
  }

  const statusLower = parsed.data.status.toLowerCase();
  const mappedStatus =
    statusLower === "success" || statusLower === "delivered"
      ? "delivered"
      : statusLower === "sent"
        ? "sent"
        : "failed";

  await getDb()
    .update(notificationDeliveries)
    .set({
      status: mappedStatus,
      lastError: parsed.data.failureReason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(notificationDeliveries.providerMessageId, parsed.data.id));

  logger.info({ status: mappedStatus }, "processed sms delivery report");
  return NextResponse.json({ received: true });
}
