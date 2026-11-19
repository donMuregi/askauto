import Link from "next/link";
import { notFound } from "next/navigation";
import { signOutAction } from "@/app/(auth)/actions";
import { BrandMark } from "@/components/layouts/brand-mark";
import { Badge } from "@/components/ui/badge";
import { formatKenyanDateTime } from "@/lib/format";
import { requireStaff } from "@/server/auth/guards";
import { getGarageJobDetailService } from "@/server/domain/garage/service";
import { GarageJobWorkspace } from "./garage-job-workspace";

export const dynamic = "force-dynamic";

export default async function GarageJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireStaff(["garage", "admin", "ops_reviewer", "ops_approver"], {
    nextPath: `/garage/jobs/${id}`,
  });

  let detail: Awaited<ReturnType<typeof getGarageJobDetailService>>;
  try {
    detail = await getGarageJobDetailService(ctx.actor, id);
  } catch {
    notFound();
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark href="/garage" />
            <Badge variant="brand">Garage</Badge>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">{ctx.user.name}</span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="font-medium text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl space-y-4 px-4 py-8 sm:px-6">
        <div>
          <Link href="/garage" className="text-xs text-accent hover:underline">
            Back to garage dashboard
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">
            Job #{detail.job.jobNo} ({detail.application.reference})
          </h1>
        </div>

        <GarageJobWorkspace
          job={{
            id: detail.job.id,
            jobNo: detail.job.jobNo,
            status: detail.job.status,
            mileageIn: detail.job.mileageIn,
            mileageOut: detail.job.mileageOut,
            arrivalChecks: detail.job.arrivalChecks ?? {},
            openedAtFormatted: formatKenyanDateTime(detail.job.openedAt),
            completedAtFormatted: detail.job.completedAt
              ? formatKenyanDateTime(detail.job.completedAt)
              : null,
          }}
          application={{
            id: detail.application.id,
            reference: detail.application.reference ?? detail.application.id,
            status: detail.application.status,
            faultDescription: detail.application.faultDescription,
          }}
          garage={
            detail.garage
              ? { name: detail.garage.name, branch: detail.garage.branchName }
              : null
          }
          customer={detail.customer}
          vehicle={
            detail.vehicle
              ? {
                  regNo: detail.vehicle.regNo,
                  makeModel: detail.vehicle.makeModel,
                  year: detail.vehicle.year,
                }
              : null
          }
          lines={detail.lines.map((l) => ({
            id: l.id,
            serviceCode: l.serviceCode,
            description: l.description,
            approvedGrade: l.approvedGrade,
            approvedBrand: l.approvedBrand,
            technicianName: l.technicianName,
            partFitted: l.partFitted,
            grade: l.grade,
            warrantyToDate: l.warrantyToDate,
            warrantyToKm: l.warrantyToKm,
            completedAtFormatted: l.completedAt ? formatKenyanDateTime(l.completedAt) : null,
          }))}
          photos={detail.photos.map((p) => ({
            id: p.id,
            kind: p.kind,
            createdAtFormatted: formatKenyanDateTime(p.createdAt),
          }))}
          recommendations={detail.recommendations.map((r) => ({
            id: r.id,
            finding: r.finding,
            urgency: r.urgency,
            reminderOn: r.reminderOn,
            createdAtFormatted: formatKenyanDateTime(r.createdAt),
          }))}
          handover={
            detail.handover
              ? {
                  id: detail.handover.id,
                  roadTestKm: detail.handover.roadTestKm,
                  roadTestResult: detail.handover.roadTestResult,
                  walkthroughDone: detail.handover.walkthroughDone,
                  partsReturned: detail.handover.partsReturned,
                  nextServiceKm: detail.handover.nextServiceKm,
                  nextServiceDate: detail.handover.nextServiceDate,
                  handedOverAtFormatted: detail.handover.handedOverAt
                    ? formatKenyanDateTime(detail.handover.handedOverAt)
                    : null,
                }
              : null
          }
        />
      </main>
    </div>
  );
}
