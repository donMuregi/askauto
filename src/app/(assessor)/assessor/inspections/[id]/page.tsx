import { notFound } from "next/navigation";
import { signOutAction } from "@/app/(auth)/actions";
import { BrandMark } from "@/components/layouts/brand-mark";
import { Badge } from "@/components/ui/badge";
import { formatKenyanDateTime } from "@/lib/format";
import { requireStaff } from "@/server/auth/guards";
import { getAssessorInspectionWorkspace } from "@/server/domain/inspections/service";
import { InspectionWorkspace } from "./inspection-workspace";

export const dynamic = "force-dynamic";

export default async function AssessorInspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireStaff(["assessor", "ops_reviewer", "ops_approver", "admin"], {
    nextPath: `/assessor/inspections/${id}`,
  });

  let workspace: Awaited<ReturnType<typeof getAssessorInspectionWorkspace>>;
  try {
    workspace = await getAssessorInspectionWorkspace(ctx.actor, id);
  } catch {
    notFound();
  }

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

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <InspectionWorkspace
          application={{
            id: workspace.application.id,
            reference: workspace.application.reference,
            status: workspace.application.status,
            productCode: workspace.application.productCode,
            faultDescription: workspace.application.faultDescription,
          }}
          vehicle={
            workspace.vehicle
              ? {
                  regNo: workspace.vehicle.regNo,
                  makeModel: workspace.vehicle.makeModel,
                  year: workspace.vehicle.year,
                }
              : null
          }
          customer={
            workspace.customer
              ? {
                  name: workspace.customer.name,
                  phoneNumber: workspace.customer.phoneNumber,
                }
              : null
          }
          booking={
            workspace.booking
              ? {
                  slotStartFormatted: formatKenyanDateTime(workspace.booking.booking.slotStart),
                  garageLabel:
                    workspace.booking.garageBranch ?? workspace.booking.garageName,
                }
              : null
          }
          inspection={
            workspace.inspection
              ? {
                  id: workspace.inspection.id,
                  status: workspace.inspection.status,
                  mileageKm: workspace.inspection.mileageKm,
                  durationMinutes: workspace.inspection.durationMinutes,
                  diagnosticsRun: workspace.inspection.diagnosticsRun,
                  faultCodes: workspace.inspection.faultCodes,
                  fuelTransmissionNote: workspace.inspection.fuelTransmissionNote,
                  returnNotes: workspace.inspection.returnNotes,
                }
              : null
          }
          initialFindings={workspace.findings.map((f) => ({
            componentCode: f.componentCode,
            componentLabel: f.componentLabel,
            findingText: f.findingText,
            recommendedAction: f.recommendedAction,
            urgency: f.urgency,
          }))}
          existingPhotosCount={workspace.photos.length}
          scope={
            workspace.scope
              ? {
                  id: workspace.scope.id,
                  version: workspace.scope.version,
                  status: workspace.scope.status,
                  subtotalKes: workspace.scope.subtotalKes,
                  vatKes: workspace.scope.vatKes,
                  totalKes: workspace.scope.totalKes,
                }
              : null
          }
          initialScopeItems={workspace.scopeItems.map((item) => ({
            id: item.id,
            serviceId: item.serviceId,
            description: item.description,
            partGrade: (item.partGrade as "OEM" | "aftermarket" | "none") ?? "OEM",
            partBrand: item.partBrand ?? "",
            partsKes: item.partsKes,
            labourKes: item.labourKes,
            decision: item.decision,
          }))}
          catalogue={workspace.catalogue}
        />
      </main>
    </div>
  );
}
