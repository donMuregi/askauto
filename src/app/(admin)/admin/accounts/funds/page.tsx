import { signOutAction } from "@/app/(auth)/actions";
import { StaffShell } from "@/components/layouts/staff-shell";
import { formatKenyanDateTime } from "@/lib/format";
import { requireStaff } from "@/server/auth/guards";
import { listApplicationsAwaitingFunds } from "@/server/domain/lenders/service";
import { FundsReceiptClient } from "./funds-receipt-client";

export const dynamic = "force-dynamic";

export default async function AccountsFundsReceiptPage() {
  const ctx = await requireStaff(["accounts", "admin"], {
    nextPath: "/admin/accounts/funds",
  });
  const items = await listApplicationsAwaitingFunds();

  return (
    <StaffShell
      userName={ctx.user.name}
      roles={ctx.staff!.roles}
      signOutAction={signOutAction}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Funds receipt confirmation</h1>
          <p className="text-sm text-muted-foreground">
            Confirm receipt of lender funds for customer-accepted offers. Once both lender payment approval and funds receipt are recorded, the garage repair job card opens automatically.
          </p>
        </div>
        <FundsReceiptClient
          items={items.map((item) => ({
            id: item.id,
            reference: item.reference,
            productCode: item.productCode,
            customerName: item.customerName,
            lenderName: item.lenderName,
            regNo: item.regNo,
            lenderApproval: item.lenderApproval
              ? {
                  amountKes: item.lenderApproval.amountKes,
                  reference: item.lenderApproval.reference,
                  expectedDate: item.lenderApproval.expectedDate,
                  recordedAtFormatted: formatKenyanDateTime(item.lenderApproval.recordedAt),
                }
              : null,
            fundsReceived: item.fundsReceived
              ? {
                  amountKes: item.fundsReceived.amountKes,
                  reference: item.fundsReceived.reference,
                  discrepancyFlag: item.fundsReceived.discrepancyFlag,
                  recordedAtFormatted: formatKenyanDateTime(item.fundsReceived.recordedAt),
                }
              : null,
          }))}
        />
      </div>
    </StaffShell>
  );
}
