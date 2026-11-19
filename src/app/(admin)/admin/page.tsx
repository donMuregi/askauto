import { desc, sql } from "drizzle-orm";
import { signOutAction } from "@/app/(auth)/actions";
import { StaffShell } from "@/components/layouts/staff-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKenyanDateTime } from "@/lib/format";
import { requireStaff } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { applications } from "@/server/db/schema";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const ctx = await requireStaff([], { nextPath: "/admin" });
  const db = getDb();

  const [statusCounts, recentApps] = await Promise.all([
    db
      .select({
        status: applications.status,
        count: sql<number>`count(*)::int`,
      })
      .from(applications)
      .groupBy(applications.status),
    db.select().from(applications).orderBy(desc(applications.createdAt)).limit(20),
  ]);

  const countFor = (status: string) =>
    statusCounts.find((s) => s.status === status)?.count ?? 0;

  return (
    <StaffShell
      userName={ctx.user.name}
      roles={ctx.staff?.roles ?? []}
      signOutAction={signOutAction}
    >
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Operations dashboard</h1>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Booked inspections</CardDescription>
              <CardTitle className="text-2xl">{countFor("BOOKED")}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Reports to release</CardDescription>
              <CardTitle className="text-2xl">{countFor("REPORT_SUBMITTED")}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Scopes to build</CardDescription>
              <CardTitle className="text-2xl">{countFor("REPORT_READY")}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Documents under review</CardDescription>
              <CardTitle className="text-2xl">{countFor("UNDER_REVIEW")}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent applications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {recentApps.length === 0 ? (
              <p className="text-muted-foreground">No applications yet.</p>
            ) : (
              recentApps.map((app) => (
                <div
                  key={app.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-3"
                >
                  <div>
                    <p className="font-medium">{app.reference ?? "Draft (no ref yet)"}</p>
                    <p className="text-xs text-muted-foreground">
                      {app.productCode} | {formatKenyanDateTime(app.createdAt)}
                    </p>
                  </div>
                  <Badge variant="brand">{app.status}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </StaffShell>
  );
}
