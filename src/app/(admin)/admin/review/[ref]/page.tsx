import { notFound } from "next/navigation";
import { signOutAction } from "@/app/(auth)/actions";
import { StaffShell } from "@/components/layouts/staff-shell";
import { formatKenyanDateTime } from "@/lib/format";
import { requireStaff } from "@/server/auth/guards";
import { getOpsWorkspaceData } from "@/server/domain/review/service";
import { OpsWorkspace } from "./ops-workspace";

export const dynamic = "force-dynamic";

export default async function OpsReviewWorkspacePage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const decodedRef = decodeURIComponent(ref);
  const ctx = await requireStaff(["ops_reviewer", "ops_approver", "admin"], {
    nextPath: `/admin/review/${encodeURIComponent(decodedRef)}`,
  });

  let data: Awaited<ReturnType<typeof getOpsWorkspaceData>>;
  try {
    data = await getOpsWorkspaceData(ctx.actor, decodedRef);
  } catch {
    notFound();
  }

  const checklist = (data.opsReview?.checklist ?? {}) as Record<string, boolean>;
  const priceCheck = (data.opsReview?.priceCheck ?? {}) as Record<string, boolean>;
  const roles = ctx.staff?.roles ?? [];

  return (
    <StaffShell userName={ctx.user.name} roles={roles} signOutAction={signOutAction}>
      <OpsWorkspace
        canApproveVariance={roles.includes("ops_approver") || roles.includes("admin")}
        application={{
          id: data.application.id,
          reference: data.application.reference ?? decodedRef,
          status: data.application.status,
          productCode: data.application.productCode,
          faultDescription: data.application.faultDescription,
          depositKes: data.application.depositKes,
          financingEligible: data.application.financingEligible,
          employeeNumber: data.application.employeeNumber,
          yearsInService: data.application.yearsInService,
          platform: data.application.platform,
        }}
        customer={data.customer}
        vehicle={
          data.vehicle
            ? {
                regNo: data.vehicle.regNo,
                makeModel: data.vehicle.makeModel,
                year: data.vehicle.year,
              }
            : null
        }
        lender={data.lender ? { name: data.lender.name, code: data.lender.code } : null}
        employerScheme={data.employerScheme}
        inspection={
          data.inspection
            ? {
                id: data.inspection.id,
                status: data.inspection.status,
                mileageKm: data.inspection.mileageKm,
                durationMinutes: data.inspection.durationMinutes,
                diagnosticsRun: data.inspection.diagnosticsRun,
                faultCodes: data.inspection.faultCodes,
                fuelTransmissionNote: data.inspection.fuelTransmissionNote,
              }
            : null
        }
        findings={data.findings.map((f) => ({
          id: f.id,
          componentLabel: f.componentLabel,
          findingText: f.findingText,
          recommendedAction: f.recommendedAction,
          urgency: f.urgency,
        }))}
        scope={
          data.scope
            ? {
                id: data.scope.id,
                version: data.scope.version,
                status: data.scope.status,
                subtotalKes: data.scope.subtotalKes,
                vatKes: data.scope.vatKes,
                totalKes: data.scope.totalKes,
                approvedBy: data.scope.approvedBy,
              }
            : null
        }
        scopeItems={data.scopeItems.map((i) => ({
          id: i.id,
          serviceCode: i.serviceCode,
          description: i.description,
          partGrade: i.partGrade,
          partBrand: i.partBrand,
          partsKes: i.partsKes,
          labourKes: i.labourKes,
          lineTotalKes: i.lineTotalKes,
          varianceFlag: i.varianceFlag,
          decision: i.decision,
        }))}
        checklistDocs={data.checklistDocs.map((d) => ({
          docType: d.docType,
          required: d.required,
          uploadedBy: d.uploadedBy,
          upload: d.upload
            ? {
                id: d.upload.id,
                status: d.upload.status,
                mime: d.upload.mime,
                sizeBytes: d.upload.sizeBytes,
              }
            : null,
          latestReview: d.latestReview
            ? {
                decision: d.latestReview.decision,
                reasonCode: d.latestReview.reasonCode,
                note: d.latestReview.note,
              }
            : null,
          filePassword: d.filePassword,
        }))}
        initialChecklist={{
          namesMatch: Boolean(checklist.names_match),
          nothingMissing: Boolean(checklist.nothing_missing),
          legible: Boolean(checklist.legible),
          eligibilityChecked: Boolean(checklist.eligibility_checked),
          deductionHeadroomChecked: Boolean(checklist.deduction_headroom_checked),
          priceCheckPassed: Boolean(priceCheck.passed),
        }}
        gates={data.gates}
        canForward={data.canForward}
        submissions={data.submissions.map((s) => ({
          id: s.id,
          packageVersion: s.packageVersion,
          status: s.status,
          submittedAtFormatted: formatKenyanDateTime(s.submittedAt),
        }))}
        history={data.history.map((h) => ({
          id: h.id,
          fromStatus: h.fromStatus,
          toStatus: h.toStatus,
          actorType: h.actorType,
          reason: h.reason,
          createdAtFormatted: formatKenyanDateTime(h.createdAt),
        }))}
      />
    </StaffShell>
  );
}
