import { formatKenyanDateTime } from "@/lib/format";
import { requireCustomer } from "@/server/auth/guards";
import {
  getReminderPreferences,
  listInAppNotifications,
} from "@/server/domain/notifications/in-app";
import { NotificationsPanel } from "./notifications-panel";

export const dynamic = "force-dynamic";

export default async function AccountNotificationsPage() {
  const ctx = await requireCustomer({ verified: false, nextPath: "/account/notifications" });
  const [items, prefs] = await Promise.all([
    listInAppNotifications(ctx.actor),
    getReminderPreferences(ctx.actor),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
      <NotificationsPanel
        notifications={items.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          link: n.link,
          read: Boolean(n.readAt),
          createdAtFormatted: formatKenyanDateTime(n.createdAt),
        }))}
        preferences={prefs}
      />
    </div>
  );
}
