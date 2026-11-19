import Link from "next/link";
import { signOutAction } from "@/app/(auth)/actions";
import { LenderShell } from "@/components/layouts/lender-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKenyanDateTime, formatKes } from "@/lib/format";
import { requireLender } from "@/server/auth/guards";
import { getLenderDashboardData } from "@/server/domain/lenders/service";

export const dynamic = "force-dynamic";

function statusVariant(
  status: string,
): "neutral" | "brand" | "accent" | "success" | "destructive" {
  switch (status) {
    case "WITH_LENDER":
      return "accent";
    case "OFFER_MADE":
    case "APPROVED":
      return "brand";
    case "REPAIR_IN_PROGRESS":
    case "REPAYING":
    case "SETTLED":
      return "success";
    case "DECLINED":
    case "CANCELLED":
    case "EXPIRED":
      return "destructive";
    default:
      return "neutral";
  }
}

export default async function LenderDashboardPage() {
  const ctx = await requireLender(undefined, { nextPath: "/lender" });
  const data = await getLenderDashboardData(ctx.actor);

  const inboxRows = data.rows.filter((r) => r.appStatus === "WITH_LENDER");
  const awaitingPaymentRows = data.rows.filter(
    (r) => r.appStatus === "APPROVED" && !r.hasLenderApproval,
  );

  return (
    <LenderShell
      lenderName={ctx.lender!.name}
      userName={`${ctx.user.name} (${ctx.lender!.role})`}
      signOutAction={signOutAction}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Lender dashboard</h1>
            <p className="text-sm text-muted-foreground">
              {ctx.lender!.name} | Role: {ctx.lender!.role === "approver" ? "Approver" : "Viewer (read-only)"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Link
              href="/lender/inbox"
              className="rounded-md bg-brand px-3 py-1.5 font-medium text-brand-foreground hover:opacity-90"
            >
              Open inbox ({data.counts.inboxCount})
            </Link>
            <Link
              href="/lender/repayments/upload"
              className="rounded-md border border-border bg-surface px-3 py-1.5 font-medium text-foreground hover:bg-surface-muted"
            >
              Upload repayment CSV
            </Link>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-1">
              <CardDescription>Inbox pending decision</CardDescription>
              <CardTitle className="text-2xl">{data.counts.inboxCount}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              <Link href="/lender/inbox" className="text-accent hover:underline">
                Review submissions
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardDescription>Offers pending customer</CardDescription>
              <CardTitle className="text-2xl">{data.counts.offersPendingCount}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Awaiting customer e-signature
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardDescription>Awaiting payment approval</CardDescription>
              <CardTitle className="text-2xl">{data.counts.awaitingPaymentApprovalCount}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Customer accepted offer; record attestation
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardDescription>Repairs in progress</CardDescription>
              <CardTitle className="text-2xl">{data.counts.repairInProgressCount}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Active garage job cards
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardDescription>Repaying</CardDescription>
              <CardTitle className="text-2xl">{data.counts.repayingCount}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Active repayment portfolio
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardDescription>Settled</CardDescription>
              <CardTitle className="text-2xl">{data.counts.settledCount}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Closed and fully repaid
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Repayment health</CardTitle>
            <CardDescription>Latest reported state across your financed portfolio.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-border bg-surface-muted p-3">
              <p className="text-xs text-muted-foreground">Current</p>
              <p className="mt-1 text-xl font-semibold">{data.repaymentSummary.current}</p>
            </div>
            <div className="rounded-md border border-border bg-surface-muted p-3">
              <p className="text-xs text-muted-foreground">Catch-up</p>
              <p className="mt-1 text-xl font-semibold">{data.repaymentSummary.catchUp}</p>
            </div>
            <div className="rounded-md border border-border bg-surface-muted p-3">
              <p className="text-xs text-muted-foreground">Arrears</p>
              <p className="mt-1 text-xl font-semibold text-destructive">
                {data.repaymentSummary.arrears}
              </p>
            </div>
            <div className="rounded-md border border-border bg-surface-muted p-3">
              <p className="text-xs text-muted-foreground">Settled</p>
              <p className="mt-1 text-xl font-semibold text-success">
                {data.repaymentSummary.settled}
              </p>
            </div>
          </CardContent>
        </Card>

        {awaitingPaymentRows.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Action required: Record payment approval</CardTitle>
              <CardDescription>
                Customer accepted your offer. Record payment approval so Ask AutoParts can release the repair job card.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {awaitingPaymentRows.map((row) => (
                <Link
                  key={row.submissionId}
                  href={`/lender/applications/${encodeURIComponent(row.reference ?? row.applicationId)}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-brand/40 bg-brand-soft/40 px-4 py-3 text-sm hover:bg-brand-soft"
                >
                  <div>
                    <p className="font-semibold text-foreground">
                      {row.reference} — {row.customerName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {row.regNo ?? "No plate"} ({row.makeModel ?? "Vehicle"}) | Financed:{" "}
                      {row.financedAmountKes !== null ? formatKes(row.financedAmountKes) : "See package"}
                    </p>
                  </div>
                  <Badge variant="brand">Record payment approval</Badge>
                </Link>
              ))}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Pending underwriting inbox</CardTitle>
              <CardDescription>
                Frozen packages awaiting your decision.
              </CardDescription>
            </div>
            <Link href="/lender/applications" className="text-xs font-medium text-accent hover:underline">
              View all applications
            </Link>
          </CardHeader>
          <CardContent>
            {inboxRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No pending applications in your inbox right now.
              </p>
            ) : (
              <div className="space-y-2">
                {inboxRows.map((row) => (
                  <Link
                    key={row.submissionId}
                    href={`/lender/applications/${encodeURIComponent(row.reference ?? row.applicationId)}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-4 py-3 text-sm hover:bg-surface-muted"
                  >
                    <div>
                      <p className="font-semibold text-foreground">
                        {row.reference} — {row.customerName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.productCode === "RIDE_HAILING" ? "Ride-hailing" : "Salaried"} |{" "}
                        {row.regNo ?? "No plate"} ({row.makeModel ?? "Vehicle"}) | Package v{row.packageVersion}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Submitted {formatKenyanDateTime(row.submittedAt)}
                        {row.slaDueAt ? ` | SLA due ${formatKenyanDateTime(row.slaDueAt)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {row.financedAmountKes !== null ? (
                        <span className="font-mono text-sm font-semibold">
                          {formatKes(row.financedAmountKes)}
                        </span>
                      ) : null}
                      <Badge variant={statusVariant(row.appStatus)}>
                        {row.substatus === "info_requested" ? "Info requested" : "Review package"}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </LenderShell>
  );
}
