import Link from "next/link";
import { signOutAction } from "@/app/(auth)/actions";
import { StaffShell } from "@/components/layouts/staff-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKenyanDateTime, formatKes } from "@/lib/format";
import { requireStaff } from "@/server/auth/guards";
import { getOpsWorkQueue } from "@/server/domain/review/service";

export const dynamic = "force-dynamic";

export default async function AdminApplicationsPage() {
  const ctx = await requireStaff(["ops_reviewer", "ops_approver", "admin"], {
    nextPath: "/admin/applications",
  });
  const rows = await getOpsWorkQueue(ctx.actor);

  return (
    <StaffShell
      userName={ctx.user.name}
      roles={ctx.staff?.roles ?? []}
      signOutAction={signOutAction}
    >
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">All applications ({rows.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {rows.length === 0 ? (
              <p className="text-muted-foreground">No applications yet.</p>
            ) : (
              rows.map((row) => (
                <Link
                  key={row.id}
                  href={`/admin/review/${encodeURIComponent(row.reference!)}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 hover:border-brand hover:bg-surface-muted/40"
                >
                  <div>
                    <p className="font-semibold">
                      {row.reference} — {row.customerName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.productCode} | {row.regNo ?? "No plate"} |{" "}
                      {formatKenyanDateTime(row.updatedAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {row.scopeTotalKes !== null ? (
                      <span className="font-medium">{formatKes(row.scopeTotalKes)}</span>
                    ) : null}
                    <Badge variant="brand">{row.status}</Badge>
                  </div>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </StaffShell>
  );
}
