import { desc, eq } from "drizzle-orm";
import { signOutAction } from "@/app/(auth)/actions";
import { StaffShell } from "@/components/layouts/staff-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKenyanDateTime } from "@/lib/format";
import { requireStaff } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { notificationDeliveries, notificationEvents } from "@/server/db/schema";

export const dynamic = "force-dynamic";

export default async function AdminNotificationsLogPage() {
  const ctx = await requireStaff(["ops_reviewer", "ops_approver", "admin"], {
    nextPath: "/admin/notifications",
  });

  const rows = await getDb()
    .select({
      delivery: notificationDeliveries,
      eventType: notificationEvents.type,
    })
    .from(notificationDeliveries)
    .innerJoin(notificationEvents, eq(notificationDeliveries.eventId, notificationEvents.id))
    .orderBy(desc(notificationDeliveries.createdAt))
    .limit(100);

  return (
    <StaffShell
      userName={ctx.user.name}
      roles={ctx.staff?.roles ?? []}
      signOutAction={signOutAction}
    >
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Notification delivery log</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent deliveries ({rows.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {rows.length === 0 ? (
              <p className="text-muted-foreground">No notification deliveries logged yet.</p>
            ) : (
              rows.map(({ delivery, eventType }) => (
                <div
                  key={delivery.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-3"
                >
                  <div>
                    <p className="font-medium">
                      {eventType} ({delivery.channel})
                    </p>
                    <p className="text-xs text-muted-foreground">
                      To: {delivery.recipient} | Attempts: {delivery.attempts} |{" "}
                      {formatKenyanDateTime(delivery.createdAt)}
                    </p>
                    {delivery.lastError ? (
                      <p className="text-xs text-destructive">{delivery.lastError}</p>
                    ) : null}
                  </div>
                  <Badge
                    variant={
                      delivery.status === "sent" || delivery.status === "delivered"
                        ? "success"
                        : delivery.status === "failed" || delivery.status === "bounced"
                          ? "destructive"
                          : "neutral"
                    }
                  >
                    {delivery.status}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </StaffShell>
  );
}
