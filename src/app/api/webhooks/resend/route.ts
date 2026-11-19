import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getDb } from "@/server/db/client";
import {
  emailSuppressions,
  inAppNotifications,
  notificationDeliveries,
  user,
} from "@/server/db/schema";

const resendEventSchema = z.object({
  type: z.string(),
  data: z.object({
    email_id: z.string().optional(),
    to: z.array(z.string()).optional(),
  }),
});

export async function POST(request: Request) {
  const env = getEnv();
  const rawBody = await request.text();

  if (env.RESEND_WEBHOOK_SECRET) {
    const svixId = request.headers.get("svix-id");
    const svixTimestamp = request.headers.get("svix-timestamp");
    const svixSignature = request.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return NextResponse.json({ error: "Missing webhook signature" }, { status: 401 });
    }

    try {
      const wh = new Webhook(env.RESEND_WEBHOOK_SECRET);
      wh.verify(rawBody, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      });
    } catch {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }
  } else if (env.INTEGRATIONS_MODE === "real") {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let parsedBody: z.infer<typeof resendEventSchema>;
  try {
    parsedBody = resendEventSchema.parse(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const db = getDb();
  const now = new Date();
  const providerMessageId = parsedBody.data.email_id;

  let nextStatus: "delivered" | "bounced" | "failed" | null = null;
  let suppressionReason: "bounce" | "complaint" | null = null;

  if (parsedBody.type === "email.delivered") {
    nextStatus = "delivered";
  } else if (parsedBody.type === "email.bounced") {
    nextStatus = "bounced";
    suppressionReason = "bounce";
  } else if (parsedBody.type === "email.complained") {
    nextStatus = "bounced";
    suppressionReason = "complaint";
  } else if (parsedBody.type === "email.delivery_delayed") {
    nextStatus = null;
  }

  if (providerMessageId && nextStatus) {
    await db
      .update(notificationDeliveries)
      .set({ status: nextStatus, updatedAt: now })
      .where(eq(notificationDeliveries.providerMessageId, providerMessageId));
  }

  if (suppressionReason && parsedBody.data.to) {
    for (const recipient of parsedBody.data.to) {
      const normalized = recipient.trim().toLowerCase();
      await db
        .insert(emailSuppressions)
        .values({ email: normalized, reason: suppressionReason })
        .onConflictDoNothing({ target: emailSuppressions.email });

      const [matchedUser] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, normalized))
        .limit(1);

      if (matchedUser) {
        await db.insert(inAppNotifications).values({
          userId: matchedUser.id,
          title: "Update your email address",
          body: "We could not deliver email to your address on file. Update your email in Profile.",
          link: "/account/profile",
        });
      }
    }
  }

  logger.info({ eventType: parsedBody.type }, "processed resend webhook");
  return NextResponse.json({ received: true });
}
