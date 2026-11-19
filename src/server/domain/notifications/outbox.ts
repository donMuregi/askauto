import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { logger } from "@/lib/logger";
import { getDb, type DbOrTx } from "@/server/db/client";
import {
  emailSuppressions,
  inAppNotifications,
  notificationDeliveries,
  notificationEvents,
  notificationPreferences,
  staffProfiles,
  user,
} from "@/server/db/schema";
import { getEmailProvider } from "@/server/integrations/notifications/email";
import { getSmsProvider } from "@/server/integrations/notifications/sms";
import type { EmailProvider, SmsProvider } from "@/server/integrations/notifications/types";
import {
  renderEmailTemplate,
  SAMPLE_EMAIL_PAYLOADS,
  type EmailTemplateKey,
} from "../../../../emails/render";
import {
  computeNextRetryAt,
  EVENT_RULES,
  formatSmsMessage,
  isInQuietHoursEat,
  nextQuietHoursEndUtc,
  type NotificationChannel,
} from "./rules";

export interface EnqueueNotificationInput {
  type: string;
  userId?: string | null;
  applicationId?: string | null;
  payload: Record<string, unknown>;
  dedupeKey: string;
}

export async function enqueueNotification(
  db: DbOrTx,
  input: EnqueueNotificationInput,
): Promise<{ eventId: string | null; inserted: boolean }> {
  const rows = await db
    .insert(notificationEvents)
    .values({
      type: input.type,
      userId: input.userId ?? null,
      applicationId: input.applicationId ?? null,
      payload: input.payload,
      dedupeKey: input.dedupeKey,
    })
    .onConflictDoNothing({ target: notificationEvents.dedupeKey })
    .returning({ id: notificationEvents.id });

  if (!rows[0]) {
    return { eventId: null, inserted: false };
  }
  return { eventId: rows[0].id, inserted: true };
}

export interface DispatchDependencies {
  emailProvider?: EmailProvider;
  smsProvider?: SmsProvider;
  now?: Date;
}

function isEmailTemplateKey(key: string): key is EmailTemplateKey {
  return key in SAMPLE_EMAIL_PAYLOADS;
}

async function alertOpsCriticalFailure(db: DbOrTx, deliveryId: string, eventType: string) {
  const opsStaff = await db
    .select({ userId: staffProfiles.userId })
    .from(staffProfiles)
    .where(
      sql`${staffProfiles.active} = true AND (${staffProfiles.roles} && ARRAY['ops_reviewer','ops_approver','admin']::staff_role[])`,
    );

  for (const staff of opsStaff) {
    await db.insert(inAppNotifications).values({
      userId: staff.userId,
      title: "Critical notification delivery failed",
      body: `Delivery ${deliveryId} for event ${eventType} failed after maximum retries.`,
      link: "/admin/notifications",
    });
  }
}

export async function dispatchNotificationEvent(
  eventId: string,
  deps: DispatchDependencies = {},
): Promise<{ dispatched: boolean; deliveries: number }> {
  const db = getDb();
  const now = deps.now ?? new Date();
  const emailProvider = deps.emailProvider ?? getEmailProvider();
  const smsProvider = deps.smsProvider ?? getSmsProvider();

  const [event] = await db
    .select()
    .from(notificationEvents)
    .where(eq(notificationEvents.id, eventId))
    .limit(1);

  if (!event || event.processedAt) {
    return { dispatched: false, deliveries: 0 };
  }

  const rule = EVENT_RULES[event.type] ?? {
    channels: ["in_app"] as NotificationChannel[],
    category: "transactional" as const,
    critical: false,
    bypassQuietHours: true,
  };

  let targetEmail =
    typeof event.payload.toEmail === "string" ? event.payload.toEmail.toLowerCase() : null;
  let targetPhone = typeof event.payload.toPhone === "string" ? event.payload.toPhone : null;
  let userRow: typeof user.$inferSelect | undefined;

  if (event.userId) {
    const [found] = await db.select().from(user).where(eq(user.id, event.userId)).limit(1);
    userRow = found;
    if (!targetEmail && userRow?.email) {
      targetEmail = userRow.email.toLowerCase();
    }
    if (!targetPhone && userRow?.phoneNumber) {
      targetPhone = userRow.phoneNumber;
    }
  }

  const userPrefs =
    event.userId && rule.category === "reminders"
      ? await db
          .select()
          .from(notificationPreferences)
          .where(
            and(
              eq(notificationPreferences.userId, event.userId),
              eq(notificationPreferences.category, "reminders"),
            ),
          )
      : [];

  const isChannelEnabled = (channel: NotificationChannel): boolean => {
    if (rule.category === "transactional") return true;
    const pref = userPrefs.find((p) => p.channel === channel);
    return pref ? pref.enabled : true;
  };

  let deliveryCount = 0;
  let emailSuppressed = false;

  if (targetEmail) {
    const [suppressed] = await db
      .select()
      .from(emailSuppressions)
      .where(eq(emailSuppressions.email, targetEmail))
      .limit(1);
    emailSuppressed = Boolean(suppressed);
  }

  const channelsToAttempt = [...rule.channels];
  if (emailSuppressed && rule.critical && !channelsToAttempt.includes("in_app") && event.userId) {
    channelsToAttempt.push("in_app");
  }

  for (const channel of channelsToAttempt) {
    if (!isChannelEnabled(channel)) {
      continue;
    }

    if (channel === "email") {
      if (!targetEmail) continue;

      if (emailSuppressed) {
        await db.insert(notificationDeliveries).values({
          eventId: event.id,
          channel: "email",
          recipient: targetEmail,
          template: event.type,
          status: "suppressed",
          attempts: 0,
          lastError: "Email address is on suppression list",
        });
        deliveryCount++;
        continue;
      }

      const rendered = isEmailTemplateKey(event.type)
        ? await renderEmailTemplate(event.type, event.payload)
        : {
            subject: `Ask AutoParts notification`,
            html: `<p>Sign in to your Ask AutoParts account for an update.</p>`,
            text: "Sign in to your Ask AutoParts account for an update.",
          };

      const result = await emailProvider.send({
        to: targetEmail,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      const nextRetry =
        result.status === "failed" && !result.hardFailure ? computeNextRetryAt(1, now) : null;

      await db.insert(notificationDeliveries).values({
        eventId: event.id,
        channel: "email",
        recipient: targetEmail,
        template: event.type,
        status: result.status === "sent" ? "sent" : nextRetry ? "queued" : "failed",
        providerMessageId: result.providerMessageId || null,
        attempts: 1,
        nextRetryAt: nextRetry,
        lastError: result.error ?? null,
        sentAt: result.status === "sent" ? now : null,
      });
      deliveryCount++;
    } else if (channel === "sms") {
      if (!targetPhone) continue;

      const delayedByQuietHours =
        rule.category === "reminders" && !rule.bypassQuietHours && isInQuietHoursEat(now);

      if (delayedByQuietHours) {
        await db.insert(notificationDeliveries).values({
          eventId: event.id,
          channel: "sms",
          recipient: targetPhone,
          template: event.type,
          status: "queued",
          attempts: 0,
          nextRetryAt: nextQuietHoursEndUtc(now),
          lastError: "Queued for quiet hours (07:00 EAT)",
        });
        deliveryCount++;
        continue;
      }

      const smsText = formatSmsMessage(event.type, event.payload);
      const result = await smsProvider.send({
        to: targetPhone,
        message: smsText,
        purpose: event.type,
      });

      const nextRetry =
        result.status === "failed" && !result.hardFailure ? computeNextRetryAt(1, now) : null;

      await db.insert(notificationDeliveries).values({
        eventId: event.id,
        channel: "sms",
        recipient: targetPhone,
        template: event.type,
        status: result.status === "sent" ? "sent" : nextRetry ? "queued" : "failed",
        providerMessageId: result.providerMessageId || null,
        attempts: 1,
        nextRetryAt: nextRetry,
        lastError: result.error ?? null,
        sentAt: result.status === "sent" ? now : null,
      });
      deliveryCount++;
    } else if (channel === "in_app") {
      if (!event.userId) continue;

      await db.insert(inAppNotifications).values({
        userId: event.userId,
        title: rule.inAppTitle ?? "Account update",
        body: rule.inAppBody ? rule.inAppBody(event.payload) : "Sign in to view your latest update.",
        link: rule.inAppLink ? rule.inAppLink(event.payload) : "/account",
      });

      await db.insert(notificationDeliveries).values({
        eventId: event.id,
        channel: "in_app",
        recipient: event.userId,
        template: event.type,
        status: "delivered",
        attempts: 1,
        sentAt: now,
      });
      deliveryCount++;
    }
  }

  await db
    .update(notificationEvents)
    .set({ processedAt: now, updatedAt: now })
    .where(and(eq(notificationEvents.id, event.id), isNull(notificationEvents.processedAt)));

  return { dispatched: true, deliveries: deliveryCount };
}

export async function dispatchPendingOutbox(
  limit = 50,
  deps: DispatchDependencies = {},
): Promise<number> {
  const db = getDb();
  const pending = await db
    .select({ id: notificationEvents.id })
    .from(notificationEvents)
    .where(isNull(notificationEvents.processedAt))
    .limit(limit);

  let processed = 0;
  for (const row of pending) {
    try {
      const res = await dispatchNotificationEvent(row.id, deps);
      if (res.dispatched) processed++;
    } catch (err) {
      logger.error({ err, eventId: row.id }, "failed dispatching notification event");
    }
  }
  return processed;
}

export async function retryDueDeliveries(
  deps: DispatchDependencies = {},
): Promise<number> {
  const db = getDb();
  const now = deps.now ?? new Date();
  const emailProvider = deps.emailProvider ?? getEmailProvider();
  const smsProvider = deps.smsProvider ?? getSmsProvider();

  const due = await db
    .select({
      delivery: notificationDeliveries,
      event: notificationEvents,
    })
    .from(notificationDeliveries)
    .innerJoin(notificationEvents, eq(notificationDeliveries.eventId, notificationEvents.id))
    .where(
      and(
        eq(notificationDeliveries.status, "queued"),
        lte(notificationDeliveries.nextRetryAt, now),
      ),
    )
    .limit(50);

  let retried = 0;

  for (const { delivery, event } of due) {
    const rule = EVENT_RULES[event.type];
    const nextAttempt = delivery.attempts + 1;
    let sendResult: { providerMessageId: string; status: "sent" | "failed"; hardFailure?: boolean; error?: string } = {
      providerMessageId: "",
      status: "failed",
      hardFailure: true,
      error: "Unsupported retry channel",
    };

    if (delivery.channel === "email") {
      const rendered = isEmailTemplateKey(event.type)
        ? await renderEmailTemplate(event.type, event.payload)
        : {
            subject: "Ask AutoParts notification",
            html: "<p>Sign in to view your update.</p>",
            text: "Sign in to view your update.",
          };
      sendResult = await emailProvider.send({
        to: delivery.recipient,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
    } else if (delivery.channel === "sms") {
      sendResult = await smsProvider.send({
        to: delivery.recipient,
        message: formatSmsMessage(event.type, event.payload),
        purpose: event.type,
      });
    }

    if (sendResult.status === "sent") {
      await db
        .update(notificationDeliveries)
        .set({
          status: "sent",
          providerMessageId: sendResult.providerMessageId || null,
          attempts: nextAttempt,
          nextRetryAt: null,
          lastError: null,
          sentAt: now,
          updatedAt: now,
        })
        .where(eq(notificationDeliveries.id, delivery.id));
    } else {
      const retryAt = sendResult.hardFailure ? null : computeNextRetryAt(nextAttempt, now);
      const finalStatus = retryAt ? "queued" : "failed";

      await db
        .update(notificationDeliveries)
        .set({
          status: finalStatus,
          attempts: nextAttempt,
          nextRetryAt: retryAt,
          lastError: sendResult.error ?? "Delivery failed",
          updatedAt: now,
        })
        .where(eq(notificationDeliveries.id, delivery.id));

      if (finalStatus === "failed" && rule?.critical) {
        await alertOpsCriticalFailure(db, delivery.id, event.type);
      }
    }

    retried++;
  }

  return retried;
}

export async function dispatchImmediateAuthNotification(
  input: EnqueueNotificationInput,
  deps: DispatchDependencies = {},
): Promise<void> {
  const db = getDb();
  const { eventId } = await enqueueNotification(db, input);
  if (eventId) {
    await dispatchNotificationEvent(eventId, deps);
  }
}
