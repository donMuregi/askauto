import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import type { Actor } from "@/server/db/rls";
import { inAppNotifications, notificationPreferences } from "@/server/db/schema";
import { authorize } from "@/server/policies/can";

export async function getUnreadNotificationCount(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(inAppNotifications)
    .where(and(eq(inAppNotifications.userId, userId), isNull(inAppNotifications.readAt)));
  return row?.count ?? 0;
}

export async function listInAppNotifications(actor: Actor) {
  authorize(actor, "notification:read_own", { ownerUserId: actor.userId });
  if (!actor.userId) return [];
  const db = getDb();
  return db
    .select()
    .from(inAppNotifications)
    .where(eq(inAppNotifications.userId, actor.userId))
    .orderBy(desc(inAppNotifications.createdAt))
    .limit(50);
}

export async function markNotificationRead(actor: Actor, notificationId: string) {
  authorize(actor, "notification:read_own", { ownerUserId: actor.userId });
  if (!actor.userId) return;
  const db = getDb();
  await db
    .update(inAppNotifications)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(
      and(eq(inAppNotifications.id, notificationId), eq(inAppNotifications.userId, actor.userId)),
    );
}

export interface ReminderPreferences {
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
}

export async function getReminderPreferences(actor: Actor): Promise<ReminderPreferences> {
  authorize(actor, "notification:read_own", { ownerUserId: actor.userId });
  const defaults: ReminderPreferences = { email: true, sms: true, whatsapp: false };
  if (!actor.userId) return defaults;

  const db = getDb();
  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, actor.userId),
        eq(notificationPreferences.category, "reminders"),
      ),
    );

  for (const row of rows) {
    if (row.channel === "email") defaults.email = row.enabled;
    if (row.channel === "sms") defaults.sms = row.enabled;
    if (row.channel === "whatsapp") defaults.whatsapp = row.enabled;
  }
  return defaults;
}

export async function setReminderPreferences(
  actor: Actor,
  prefs: ReminderPreferences,
): Promise<ReminderPreferences> {
  authorize(actor, "account:manage_own", { ownerUserId: actor.userId });
  if (!actor.userId) return prefs;

  const db = getDb();
  const now = new Date();
  const entries: Array<{ channel: "email" | "sms" | "whatsapp"; enabled: boolean }> = [
    { channel: "email", enabled: prefs.email },
    { channel: "sms", enabled: prefs.sms },
    { channel: "whatsapp", enabled: prefs.whatsapp },
  ];

  for (const entry of entries) {
    await db
      .insert(notificationPreferences)
      .values({
        userId: actor.userId,
        category: "reminders",
        channel: entry.channel,
        enabled: entry.enabled,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          notificationPreferences.userId,
          notificationPreferences.category,
          notificationPreferences.channel,
        ],
        set: { enabled: entry.enabled, updatedAt: now },
      });
  }

  return prefs;
}
