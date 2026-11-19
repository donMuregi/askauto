import { signOutAction } from "@/app/(auth)/actions";
import { LenderShell } from "@/components/layouts/lender-shell";
import { requireLender } from "@/server/auth/guards";
import { listLenderApplicationsService } from "@/server/domain/lenders/service";
import { RepaymentsUploadClient } from "./repayments-upload-client";

export const dynamic = "force-dynamic";

export default async function LenderRepaymentsUploadPage() {
  const ctx = await requireLender(undefined, { nextPath: "/lender/repayments/upload" });
  const rows = await listLenderApplicationsService(ctx.actor);

  const activeReferences = rows
    .filter((r) => Boolean(r.reference))
    .map((r) => ({
      reference: r.reference!,
      customerName: r.customerName,
      status: r.appStatus,
    }));

  return (
    <LenderShell
      lenderName={ctx.lender!.name}
      userName={`${ctx.user.name} (${ctx.lender!.role})`}
      signOutAction={signOutAction}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Repayment status reporting</h1>
          <p className="text-sm text-muted-foreground">
            Upload periodic CSV batches or record individual repayment status updates for{" "}
            {ctx.lender!.name}.
          </p>
        </div>
        <RepaymentsUploadClient activeReferences={activeReferences} />
      </div>
    </LenderShell>
  );
}
