import { signOutAction } from "@/app/(auth)/actions";
import { BrandMark } from "@/components/layouts/brand-mark";
import { Badge } from "@/components/ui/badge";
import { formatKenyanDateTime } from "@/lib/format";
import { requireStaff } from "@/server/auth/guards";
import { getAssessorDashboardData } from "@/server/domain/inspections/service";
import { AssessorDashboardClient } from "./assessor-dashboard";

export const dynamic = "force-dynamic";

export default async function AssessorDashboardPage() {
  const ctx = await requireStaff(["assessor", "ops_reviewer", "ops_approver", "admin"], {
    nextPath: "/assessor",
  });

  const { items, counts } = await getAssessorDashboardData(ctx.actor);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark href="/assessor" size="sm" />
            <Badge variant="accent">Assessor Portal</Badge>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-muted-foreground sm:inline">
              {ctx.user.name}
              {ctx.staff?.kemraNo ? ` (${ctx.staff.kemraNo})` : ""}
            </span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="inline-flex min-h-9 cursor-pointer items-center rounded-2xl border border-border bg-surface px-3 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Assessor Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Open any vehicle to complete its diagnostic inspection and build the repair scope.
          </p>
        </div>

        <AssessorDashboardClient
          counts={counts}
          items={items.map((item) => ({
            applicationId: item.applicationId,
            reference: item.reference,
            applicationStatus: item.applicationStatus,
            assessmentState: item.assessmentState,
            regNo: item.regNo,
            makeModel: item.makeModel,
            vehicleYear: item.vehicleYear,
            customerName: item.customerName,
            faultDescription: item.faultDescription,
            slotStartFormatted: formatKenyanDateTime(item.slotStart),
            garageLabel: item.garageLabel,
            findingsCount: item.findingsCount,
            scopeStatus: item.scopeStatus,
            scopeTotalKes: item.scopeTotalKes,
            returnNotes: item.returnNotes,
            inspectionUpdatedFormatted: item.inspectionUpdatedAt
              ? formatKenyanDateTime(item.inspectionUpdatedAt)
              : null,
          }))}
        />
      </main>
    </div>
  );
}
