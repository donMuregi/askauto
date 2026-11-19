import { signOutAction } from "@/app/(auth)/actions";
import { LenderShell } from "@/components/layouts/lender-shell";
import { formatKenyanDateTime } from "@/lib/format";
import { requireLender } from "@/server/auth/guards";
import { listLenderApplicationsService } from "@/server/domain/lenders/service";
import { LenderApplicationsClient } from "./lender-applications-client";

export const dynamic = "force-dynamic";

export default async function LenderApplicationsPage() {
  const ctx = await requireLender(undefined, { nextPath: "/lender/applications" });
  const rows = await listLenderApplicationsService(ctx.actor);

  return (
    <LenderShell
      lenderName={ctx.lender!.name}
      userName={`${ctx.user.name} (${ctx.lender!.role})`}
      signOutAction={signOutAction}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
          <p className="text-sm text-muted-foreground">
            All applications submitted to {ctx.lender!.name}.
          </p>
        </div>
        <LenderApplicationsClient
          rows={rows.map((r) => ({
            submissionId: r.submissionId,
            applicationId: r.applicationId,
            reference: r.reference,
            appStatus: r.appStatus,
            substatus: r.substatus,
            productCode: r.productCode,
            customerName: r.customerName,
            regNo: r.regNo,
            makeModel: r.makeModel,
            packageVersion: r.packageVersion,
            submittedAtFormatted: formatKenyanDateTime(r.submittedAt),
            financedAmountKes: r.financedAmountKes,
            hasLenderApproval: r.hasLenderApproval,
            repaymentState: r.repaymentState,
          }))}
        />
      </div>
    </LenderShell>
  );
}
