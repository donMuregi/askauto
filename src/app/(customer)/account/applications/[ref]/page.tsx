import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKenyanDateTime, formatKes } from "@/lib/format";
import { requireCustomer } from "@/server/auth/guards";
import { getApplicationTrackerData } from "@/server/domain/applications/service";
import { getCustomerScopeForApproval } from "@/server/domain/inspections/service";
import {
  CUSTOMER_STATUS_LABELS,
  getWhatHappensNext,
  JOURNEY_STAGES,
  STATUS_TO_STEP,
} from "@/server/domain/applications/transition";
import { CancelApplicationForm } from "./cancel-application-form";
import { ScopeApprovalPanel } from "./scope-approval-panel";

export const dynamic = "force-dynamic";

export default async function ApplicationTrackerPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const decodedRef = decodeURIComponent(ref);
  const ctx = await requireCustomer({
    verified: true,
    nextPath: `/account/applications/${encodeURIComponent(decodedRef)}`,
  });

  let data: Awaited<ReturnType<typeof getApplicationTrackerData>>;
  try {
    data = await getApplicationTrackerData(ctx.actor, decodedRef);
  } catch {
    notFound();
  }

  const { application, vehicle, booking, history, documents, latestFeePayment } = data;
  const scopeData = await getCustomerScopeForApproval(application.id);
  const currentStep = STATUS_TO_STEP[application.status];
  const statusLabel = CUSTOMER_STATUS_LABELS[application.status];
  const nextText = getWhatHappensNext(application.status, application.productCode);
  const canCancel = ![
    "REPAIR_IN_PROGRESS",
    "REPAYING",
    "SETTLED",
    "CANCELLED",
    "EXPIRED",
  ].includes(application.status);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{application.reference}</h1>
          <p className="text-sm text-muted-foreground">
            {application.productCode === "RIDE_HAILING" ? "Ride-hailing" : "Salaried scheme"}
            {vehicle ? ` | ${vehicle.regNo} (${vehicle.makeModel})` : ""}
          </p>
        </div>
        <Badge variant="brand">{statusLabel}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Progress (Step {currentStep} of 14)</CardTitle>
          <CardDescription>{nextText}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-5">
            {JOURNEY_STAGES.map((stage) => {
              const minStep = stage.steps[0];
              const maxStep = stage.steps[stage.steps.length - 1];
              const completed = currentStep > maxStep;
              const active = currentStep >= minStep && currentStep <= maxStep;
              return (
                <div
                  key={stage.id}
                  className={`rounded-md border p-3 text-xs ${
                    active
                      ? "border-brand bg-brand-soft font-semibold text-foreground"
                      : completed
                        ? "border-success/40 bg-success-soft text-foreground"
                        : "border-border bg-surface-muted text-muted-foreground"
                  }`}
                >
                  <p>{stage.label}</p>
                  <p className="mt-1 text-[11px] opacity-80">
                    Steps {minStep} to {maxStep}
                  </p>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {scopeData.releasedInspection || scopeData.scope ? (
        <ScopeApprovalPanel
          applicationId={application.id}
          customerName={ctx.user.name}
          findings={scopeData.findings.map((f) => ({
            id: f.id,
            componentLabel: f.componentLabel,
            findingText: f.findingText,
            recommendedAction: f.recommendedAction,
            urgency: f.urgency,
          }))}
          scope={
            scopeData.scope
              ? {
                  id: scopeData.scope.id,
                  version: scopeData.scope.version,
                  status: scopeData.scope.status,
                  vatRatePct: scopeData.scope.vatRatePct,
                  subtotalKes: scopeData.scope.subtotalKes,
                  vatKes: scopeData.scope.vatKes,
                  totalKes: scopeData.scope.totalKes,
                }
              : null
          }
          items={scopeData.scopeItems.map((i) => ({
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
        />
      ) : null}

      {booking ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inspection booking</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Slot: </span>
              <span className="font-medium">{formatKenyanDateTime(booking.booking.slotStart)}</span>
            </p>
            <p>
              <span className="text-muted-foreground">Garage: </span>
              <span className="font-medium">
                {booking.garageBranch ?? booking.garageName} ({booking.garageAddress})
              </span>
            </p>
            {latestFeePayment?.mpesaReceipt ? (
              <p>
                <span className="text-muted-foreground">Fee receipt: </span>
                <span className="font-mono font-medium">
                  {latestFeePayment.mpesaReceipt} ({formatKes(latestFeePayment.amountKes)})
                </span>
              </p>
            ) : null}
            {canCancel ? (
              <div className="pt-2">
                <CancelApplicationForm applicationId={application.id} />
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documents</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {documents.length === 0 ? (
            <p>Issued documents will appear here as your application progresses.</p>
          ) : (
            <ul className="space-y-2">
              {documents.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between">
                  <span className="font-medium text-foreground">{doc.docNumber}</span>
                  <span>{doc.type}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3 text-sm">
            {history.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-b-0 last:pb-0"
              >
                <span className="font-medium">{CUSTOMER_STATUS_LABELS[item.toStatus]}</span>
                <span className="text-xs text-muted-foreground">
                  {formatKenyanDateTime(item.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
