import Link from "next/link";
import { signOutAction } from "@/app/(auth)/actions";
import { LenderShell } from "@/components/layouts/lender-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKenyanDateTime, formatKes } from "@/lib/format";
import { requireLender } from "@/server/auth/guards";
import { listLenderApplicationsService } from "@/server/domain/lenders/service";

export const dynamic = "force-dynamic";

export default async function LenderInboxPage() {
  const ctx = await requireLender(undefined, { nextPath: "/lender/inbox" });
  const rows = await listLenderApplicationsService(ctx.actor);
  const pending = rows.filter((r) => r.appStatus === "WITH_LENDER");

  return (
    <LenderShell
      lenderName={ctx.lender!.name}
      userName={`${ctx.user.name} (${ctx.lender!.role})`}
      signOutAction={signOutAction}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Underwriting inbox</h1>
          <p className="text-sm text-muted-foreground">
            Submitted application packages awaiting an underwriting decision from {ctx.lender!.name}.
          </p>
        </div>

        {pending.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Inbox is clear. No packages are currently awaiting a decision.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {pending.map((row) => {
              const slaBreached = row.slaBreached;
              return (
                <Link
                  key={row.submissionId}
                  href={`/lender/applications/${encodeURIComponent(row.reference ?? row.applicationId)}`}
                  className="block"
                >
                  <Card className="transition-colors hover:border-accent/60 hover:bg-surface-muted/40">
                    <CardHeader className="pb-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <CardTitle className="text-base">
                            {row.reference} — {row.customerName}
                          </CardTitle>
                          <CardDescription>
                            {row.productCode === "RIDE_HAILING" ? "Ride-hailing" : "Salaried scheme"} |{" "}
                            {row.regNo ?? "No plate"} ({row.makeModel ?? "Vehicle"})
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                          {slaBreached ? <Badge variant="destructive">SLA overdue</Badge> : null}
                          <Badge variant={row.substatus === "info_requested" ? "brand" : "accent"}>
                            {row.substatus === "info_requested"
                              ? "Info requested"
                              : "Awaiting decision"}
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                      <div className="space-x-3">
                        <span>Package v{row.packageVersion}</span>
                        <span>Submitted {formatKenyanDateTime(row.submittedAt)}</span>
                        {row.slaDueAt ? (
                          <span>SLA due {formatKenyanDateTime(row.slaDueAt)}</span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3">
                        {row.financedAmountKes !== null ? (
                          <span className="font-mono text-sm font-semibold text-foreground">
                            Financed: {formatKes(row.financedAmountKes)}
                          </span>
                        ) : null}
                        <span className="font-medium text-accent">Open package</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </LenderShell>
  );
}
