import { signOutAction } from "@/app/(auth)/actions";
import { StaffShell } from "@/components/layouts/staff-shell";
import { formatKenyanDateTime } from "@/lib/format";
import { requireStaff } from "@/server/auth/guards";
import { getOpsWorkQueue } from "@/server/domain/review/service";
import { ReviewQueueClient } from "./review-queue-client";

export const dynamic = "force-dynamic";

export default async function AdminReviewQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const ctx = await requireStaff(["ops_reviewer", "ops_approver", "admin"], {
    nextPath: "/admin/review",
  });
  const params = await searchParams;
  const rows = await getOpsWorkQueue(ctx.actor);

  return (
    <StaffShell
      userName={ctx.user.name}
      roles={ctx.staff?.roles ?? []}
      signOutAction={signOutAction}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Review Queue</h1>
          <p className="text-sm text-muted-foreground">
            Claim applications, review diagnostic reports and uploaded documents, and forward
            complete packages to the financing partner.
          </p>
        </div>

        <ReviewQueueClient
          initialStatus={params.status ?? "all"}
          rows={rows.map((r) => ({
            id: r.id,
            reference: r.reference!,
            status: r.status,
            productCode: r.productCode,
            customerName: r.customerName,
            customerPhone: r.customerPhone,
            regNo: r.regNo,
            makeModel: r.makeModel,
            lenderName: r.lenderName,
            assigneeName: r.assigneeName,
            scopeTotalKes: r.scopeTotalKes,
            updatedAtFormatted: formatKenyanDateTime(r.updatedAt),
            slaDueFormatted: r.slaDueAt ? formatKenyanDateTime(r.slaDueAt) : null,
          }))}
        />
      </div>
    </StaffShell>
  );
}
