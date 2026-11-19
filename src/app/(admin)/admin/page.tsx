import { desc, sql } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
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
    db.select().from(applications).orderBy(desc(applications.updatedAt)).limit(20),
  ]);

  const countFor = (status: string) =>
    statusCounts.find((s) => s.status === status)?.count ?? 0;

  const cards = [
    { label: "Reports to release", status: "REPORT_SUBMITTED", count: countFor("REPORT_SUBMITTED") },
    { label: "Scopes to build", status: "REPORT_READY", count: countFor("REPORT_READY") },
    { label: "Awaiting customer docs", status: "REPAIR_APPROVED", count: countFor("REPAIR_APPROVED") },
    { label: "Documents under review", status: "UNDER_REVIEW", count: countFor("UNDER_REVIEW") },
    { label: "With financing partner", status: "WITH_LENDER", count: countFor("WITH_LENDER") },
    { label: "Booked inspections", status: "BOOKED", count: countFor("BOOKED") },
  ];

  return (
    <StaffShell
      userName={ctx.user.name}
      roles={ctx.staff?.roles ?? []}
      signOutAction={signOutAction}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Operations dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Click any queue card or application to open the review workspace.
            </p>
          </div>
          <Link
            href="/admin/review"
            className="inline-flex min-h-10 items-center rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand-hover"
          >
            Open Review Queue
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <Link
              key={c.status}
              href={`/admin/review?status=${encodeURIComponent(c.status)}`}
              className="block rounded-lg border border-border bg-surface p-5 shadow-xs transition-colors hover:border-brand hover:bg-surface-muted/40"
            >
              <p className="text-sm text-muted-foreground">{c.label}</p>
              <p className="mt-1 text-2xl font-semibold">{c.count}</p>
            </Link>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent applications</CardTitle>
            <CardDescription>Open any application to review reports, scopes, and documents.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {recentApps.length === 0 ? (
              <p className="text-muted-foreground">No applications yet.</p>
            ) : (
              recentApps.map((app) =>
                app.reference ? (
                  <Link
                    key={app.id}
                    href={`/admin/review/${encodeURIComponent(app.reference)}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3.5 transition-colors hover:border-brand hover:bg-surface-muted/40"
                  >
                    <div>
                      <p className="font-semibold text-foreground">{app.reference}</p>
                      <p className="text-xs text-muted-foreground">
                        {app.productCode} | Updated {formatKenyanDateTime(app.updatedAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="brand">{app.status}</Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </div>
                  </Link>
                ) : (
                  <div
                    key={app.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3.5"
                  >
                    <div>
                      <p className="font-medium text-muted-foreground">Draft (no reference yet)</p>
                      <p className="text-xs text-muted-foreground">
                        {app.productCode} | {formatKenyanDateTime(app.createdAt)}
                      </p>
                    </div>
                    <Badge variant="neutral">{app.status}</Badge>
                  </div>
                ),
              )
            )}
          </CardContent>
        </Card>
      </div>
    </StaffShell>
  );
}
