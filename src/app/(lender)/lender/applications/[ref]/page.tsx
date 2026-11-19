import Link from "next/link";
import { notFound } from "next/navigation";
import { signOutAction } from "@/app/(auth)/actions";
import { LenderShell } from "@/components/layouts/lender-shell";
import { formatKenyanDateTime } from "@/lib/format";
import { requireLender } from "@/server/auth/guards";
import { getLenderApplicationPackage } from "@/server/domain/lenders/service";
import { LenderPackageWorkspace } from "./lender-package-workspace";

export const dynamic = "force-dynamic";

export default async function LenderApplicationDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const decodedRef = decodeURIComponent(ref);
  const ctx = await requireLender(undefined, {
    nextPath: `/lender/applications/${encodeURIComponent(decodedRef)}`,
  });

  let pkg: Awaited<ReturnType<typeof getLenderApplicationPackage>>;
  try {
    pkg = await getLenderApplicationPackage(ctx.actor, decodedRef);
  } catch {
    notFound();
  }

  return (
    <LenderShell
      lenderName={ctx.lender!.name}
      userName={`${ctx.user.name} (${ctx.lender!.role})`}
      signOutAction={signOutAction}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Link href="/lender/inbox" className="text-xs text-accent hover:underline">
              Back to inbox
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">{pkg.application.reference}</h1>
          </div>
        </div>

        <LenderPackageWorkspace
          viewerEmail={ctx.user.email}
          viewerUserId={ctx.user.id}
          viewedAtFormatted={formatKenyanDateTime(new Date())}
          isApprover={ctx.lender!.role === "approver"}
          makerCheckerThresholdKes={pkg.lender?.makerCheckerThresholdKes ?? null}
          application={{
            id: pkg.application.id,
            reference: pkg.application.reference ?? decodedRef,
            status: pkg.application.status,
            substatus: pkg.application.substatus,
            productCode: pkg.application.productCode,
            depositKes: pkg.application.depositKes,
          }}
          submission={{
            id: pkg.submission.id,
            packageVersion: pkg.submission.packageVersion,
            status: pkg.submission.status,
            submittedAtFormatted: formatKenyanDateTime(pkg.submission.submittedAt),
            slaDueAtFormatted: pkg.submission.slaDueAt
              ? formatKenyanDateTime(pkg.submission.slaDueAt)
              : null,
          }}
          customer={pkg.customer}
          vehicle={
            pkg.vehicle
              ? {
                  regNo: pkg.vehicle.regNo,
                  makeModel: pkg.vehicle.makeModel,
                  year: pkg.vehicle.year,
                }
              : null
          }
          financedAmountKes={pkg.financedAmountKes}
          signedScope={
            pkg.signedScope
              ? {
                  version: pkg.signedScope.version,
                  subtotalKes: pkg.signedScope.subtotalKes,
                  vatKes: pkg.signedScope.vatKes,
                  totalKes: pkg.signedScope.totalKes,
                  vatRatePct: pkg.signedScope.vatRatePct,
                }
              : null
          }
          signedScopeItems={pkg.signedScopeItems.map((i) => ({
            id: i.id,
            serviceCode: i.serviceCode,
            description: i.description,
            partGrade: i.partGrade,
            partBrand: i.partBrand,
            partsKes: i.partsKes,
            labourKes: i.labourKes,
            lineTotalKes: i.lineTotalKes,
            decision: i.decision,
          }))}
          findings={pkg.findings.map((f) => ({
            id: f.id,
            componentLabel: f.componentLabel,
            findingText: f.findingText,
            recommendedAction: f.recommendedAction,
            urgency: f.urgency,
          }))}
          approvedUploads={pkg.approvedUploads.map((u) => ({
            id: u.id,
            docType: u.docType,
            mime: u.mime,
            sizeBytes: u.sizeBytes,
          }))}
          documents={pkg.documents.map((d) => ({
            id: d.id,
            type: d.type,
            docNumber: d.docNumber,
            pdfSha256: d.pdfSha256,
            issuedAtFormatted: d.issuedAt ? formatKenyanDateTime(d.issuedAt) : null,
          }))}
          decisions={pkg.decisions.map((d) => ({
            id: d.id,
            decision: d.decision,
            approvedAmountKes: d.approvedAmountKes,
            installmentKes: d.installmentKes,
            frequency: d.frequency,
            tenorCount: d.tenorCount,
            totalPayableKes: d.totalPayableKes,
            rateText: d.rateText,
            feesText: d.feesText,
            declineReasonCode: d.declineReasonCode,
            note: d.note,
            validUntilFormatted: d.validUntil ? formatKenyanDateTime(d.validUntil) : null,
            createdAtFormatted: formatKenyanDateTime(d.createdAt),
          }))}
          latestOffer={
            pkg.latestOffer
              ? {
                  id: pkg.latestOffer.id,
                  customerResponse: pkg.latestOffer.customerResponse,
                  respondedAtFormatted: pkg.latestOffer.respondedAt
                    ? formatKenyanDateTime(pkg.latestOffer.respondedAt)
                    : null,
                }
              : null
          }
          repaymentTerms={
            pkg.repaymentTerms
              ? {
                  frequency: pkg.repaymentTerms.frequency,
                  installmentKes: pkg.repaymentTerms.installmentKes,
                  tenorCount: pkg.repaymentTerms.tenorCount,
                  firstDueDate: pkg.repaymentTerms.firstDueDate,
                  totalPayableKes: pkg.repaymentTerms.totalPayableKes,
                }
              : null
          }
          attestations={pkg.attestations.map((a) => ({
            id: a.id,
            kind: a.kind as "lender_approval" | "funds_received",
            amountKes: a.amountKes,
            reference: a.reference,
            expectedDate: a.expectedDate,
            discrepancyFlag: a.discrepancyFlag,
            recordedBy: a.recordedBy,
            secondApproverId: a.secondApproverId,
            recordedAtFormatted: formatKenyanDateTime(a.recordedAt),
          }))}
          repaymentReports={pkg.repaymentReports.map((r) => ({
            id: r.id,
            asOfDate: r.asOfDate,
            state: r.state,
            installmentsPaid: r.installmentsPaid,
            installmentsMissed: r.installmentsMissed,
            source: r.source,
            note: r.note,
            createdAtFormatted: formatKenyanDateTime(r.createdAt),
          }))}
          history={pkg.history.map((h) => ({
            id: h.id,
            toStatus: h.toStatus,
            reason: h.reason,
            createdAtFormatted: formatKenyanDateTime(h.createdAt),
          }))}
        />
      </div>
    </LenderShell>
  );
}
