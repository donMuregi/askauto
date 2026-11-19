"use client";

import { ArrowLeft, CheckCircle2, ExternalLink, Upload, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatKes } from "@/lib/format";
import { DOC_TYPE_LABELS, REJECTION_REASON_CODES } from "@/server/domain/review/constants";
import {
  approveScopeVarianceAction,
  claimTaskAction,
  forwardToLenderAction,
  moveToCashRouteAction,
  releaseReportAction,
  returnReportAction,
  reviewDocumentAction,
  saveOpsChecklistAction,
} from "../../actions";

type TabId = "summary" | "report" | "scope" | "documents" | "forward" | "timeline";

interface OpsWorkspaceProps {
  canApproveVariance: boolean;
  application: {
    id: string;
    reference: string;
    status: string;
    productCode: string;
    faultDescription: string | null;
    depositKes: number;
    financingEligible: boolean | null;
    employeeNumber: string | null;
    yearsInService: number | null;
    platform: string | null;
  };
  customer: {
    name: string;
    email: string;
    phoneNumber: string | null;
  } | null;
  vehicle: {
    regNo: string;
    makeModel: string;
    year: number | null;
  } | null;
  lender: {
    name: string;
    code: string;
  } | null;
  employerScheme: {
    employerName: string;
    agreementRef: string;
    deductionCapNote: string | null;
  } | null;
  inspection: {
    id: string;
    status: string;
    mileageKm: number | null;
    durationMinutes: number | null;
    diagnosticsRun: string[];
    faultCodes: string[];
    fuelTransmissionNote: string | null;
  } | null;
  findings: Array<{
    id: string;
    componentLabel: string;
    findingText: string;
    recommendedAction: string;
    urgency: string;
  }>;
  scope: {
    id: string;
    version: number;
    status: string;
    subtotalKes: number;
    vatKes: number;
    totalKes: number;
    approvedBy: string | null;
  } | null;
  scopeItems: Array<{
    id: string;
    serviceCode: string;
    description: string;
    partGrade: string;
    partBrand: string | null;
    partsKes: number;
    labourKes: number;
    lineTotalKes: number;
    varianceFlag: boolean;
    decision: string;
  }>;
  checklistDocs: Array<{
    docType: string;
    required: boolean;
    uploadedBy: "customer" | "ops";
    upload: {
      id: string;
      status: string;
      mime: string;
      sizeBytes: number;
    } | null;
    latestReview: {
      decision: string;
      reasonCode: string | null;
      note: string | null;
    } | null;
    filePassword: string | null;
  }>;
  initialChecklist: {
    namesMatch: boolean;
    nothingMissing: boolean;
    legible: boolean;
    eligibilityChecked: boolean;
    deductionHeadroomChecked: boolean;
    priceCheckPassed: boolean;
  };
  gates: {
    statusIsUnderReview: boolean;
    scopeSigned: boolean;
    varianceApproved: boolean;
    allRequiredDocsApproved: boolean;
    opsChecklistPassed: boolean;
    lenderResolved: boolean;
  };
  canForward: boolean;
  submissions: Array<{
    id: string;
    packageVersion: number;
    status: string;
    submittedAtFormatted: string;
  }>;
  history: Array<{
    id: string;
    fromStatus: string | null;
    toStatus: string;
    actorType: string;
    reason: string | null;
    createdAtFormatted: string;
  }>;
}

export function OpsWorkspace(props: OpsWorkspaceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<TabId>(
    props.application.status === "UNDER_REVIEW" ? "documents" : "summary",
  );
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(
    null,
  );
  const [returnReason, setReturnReason] = useState("");
  const [rejectingUploadId, setRejectingUploadId] = useState<string | null>(null);
  const [rejectReasonCode, setRejectReasonCode] = useState<string>(REJECTION_REASON_CODES[0].code);
  const [rejectNote, setRejectNote] = useState("");
  const [cashRouteReason, setCashRouteReason] = useState("");

  // Ops checklist state
  const [namesMatch, setNamesMatch] = useState(props.initialChecklist.namesMatch);
  const [nothingMissing, setNothingMissing] = useState(props.initialChecklist.nothingMissing);
  const [legible, setLegible] = useState(props.initialChecklist.legible);
  const [eligibilityChecked, setEligibilityChecked] = useState(
    props.initialChecklist.eligibilityChecked,
  );
  const [deductionHeadroomChecked, setDeductionHeadroomChecked] = useState(
    props.initialChecklist.deductionHeadroomChecked,
  );
  const [priceCheckPassed, setPriceCheckPassed] = useState(props.initialChecklist.priceCheckPassed);

  function runAction(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    setFeedback(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        setFeedback({ kind: "error", text: res.error ?? "Action failed." });
        return;
      }
      setFeedback({ kind: "success", text: res.message ?? "Updated." });
      router.refresh();
    });
  }

  async function handleOpsUpload(docType: string, file: File | null) {
    if (!file) return;
    setFeedback(null);
    const fd = new FormData();
    fd.set("applicationId", props.application.id);
    fd.set("docType", docType);
    fd.set("file", file);

    const res = await fetch("/api/uploads/direct", { method: "POST", body: fd });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || !json.ok) {
      setFeedback({ kind: "error", text: json.error ?? "Upload failed." });
      return;
    }
    setFeedback({ kind: "success", text: "Document uploaded and approved." });
    router.refresh();
  }

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "summary", label: "Summary" },
    { id: "report", label: "Report" },
    { id: "scope", label: "Scope" },
    { id: "documents", label: "Documents" },
    { id: "forward", label: "Checklist & Forward" },
    { id: "timeline", label: "Timeline" },
  ];

  const hasVariance = props.scopeItems.some((i) => i.varianceFlag);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin/review"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Review Queue
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={() => runAction(() => claimTaskAction(props.application.id))}
          >
            Claim task
          </Button>
          <Badge variant="brand">{props.application.status}</Badge>
          <Badge variant="neutral">{props.application.productCode}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">{props.application.reference}</CardTitle>
          <CardDescription>
            {props.customer?.name ?? "Customer"} | {props.customer?.phoneNumber ?? ""} |{" "}
            {props.vehicle ? `${props.vehicle.regNo} (${props.vehicle.makeModel})` : "No vehicle"}
            {props.lender ? ` | Assigned Lender: ${props.lender.name}` : ""}
          </CardDescription>
        </CardHeader>
      </Card>

      {feedback ? (
        <Alert variant={feedback.kind === "error" ? "error" : "success"}>{feedback.text}</Alert>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-border pb-3" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-10 rounded-md px-3.5 text-sm font-medium cursor-pointer ${
              tab === t.id
                ? "bg-brand text-brand-foreground"
                : "border border-border bg-surface text-muted-foreground hover:bg-surface-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "summary" ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Applicant and vehicle</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Name: </span>
                <span className="font-medium">{props.customer?.name}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Email: </span>
                <span>{props.customer?.email}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Phone: </span>
                <span>{props.customer?.phoneNumber ?? "Not set"}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Vehicle: </span>
                <span className="font-medium">
                  {props.vehicle
                    ? `${props.vehicle.regNo} — ${props.vehicle.makeModel}`
                    : "Not set"}
                </span>
              </p>
              <p>
                <span className="text-muted-foreground">Reported fault: </span>
                <span>{props.application.faultDescription ?? "None"}</span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Financing & scheme details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">Product: </span>
                <span className="font-medium">{props.application.productCode}</span>
              </p>
              <p>
                <span className="text-muted-foreground">Assigned lender (server-derived): </span>
                <span className="font-medium">{props.lender?.name ?? "None"}</span>
              </p>
              {props.application.platform ? (
                <p>
                  <span className="text-muted-foreground">Platform: </span>
                  <span className="uppercase">{props.application.platform}</span>
                </p>
              ) : null}
              {props.employerScheme ? (
                <>
                  <p>
                    <span className="text-muted-foreground">Employer: </span>
                    <span className="font-medium">{props.employerScheme.employerName}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Agreement: </span>
                    <span className="font-mono">{props.employerScheme.agreementRef}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Employee No: </span>
                    <span>
                      {props.application.employeeNumber} ({props.application.yearsInService ?? 0}{" "}
                      years)
                    </span>
                  </p>
                </>
              ) : null}
              {props.scope ? (
                <p>
                  <span className="text-muted-foreground">Repair scope total: </span>
                  <span className="font-semibold">{formatKes(props.scope.totalKes)}</span> (Deposit:{" "}
                  {formatKes(props.application.depositKes)})
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "report" ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Diagnostic inspection report</CardTitle>
              {props.inspection ? <Badge variant="accent">{props.inspection.status}</Badge> : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {!props.inspection ? (
              <p className="text-muted-foreground">No diagnostic report submitted yet.</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3 rounded-md bg-surface-muted p-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Mileage</p>
                    <p className="font-semibold">{props.inspection.mileageKm ?? 0} km</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="font-semibold">{props.inspection.durationMinutes ?? 0} mins</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">OBD Fault Codes</p>
                    <p className="font-mono">
                      {props.inspection.faultCodes.length > 0
                        ? props.inspection.faultCodes.join(", ")
                        : "None"}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {props.findings.map((f) => (
                    <div key={f.id} className="rounded border border-border p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{f.componentLabel}</span>
                        <Badge variant={f.urgency === "do_not_delay" ? "destructive" : "neutral"}>
                          {f.urgency.replaceAll("_", " ")}
                        </Badge>
                      </div>
                      <p className="mt-1 text-muted-foreground">{f.findingText}</p>
                      <p className="text-xs text-muted-foreground">Action: {f.recommendedAction}</p>
                    </div>
                  ))}
                </div>

                {props.application.status === "REPORT_SUBMITTED" ? (
                  <div className="space-y-3 border-t border-border pt-4">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={isPending}
                        onClick={() => runAction(() => releaseReportAction(props.application.id))}
                      >
                        Release report to customer
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <Label htmlFor="returnReason">Or return to assessor with reason</Label>
                        <Input
                          id="returnReason"
                          value={returnReason}
                          onChange={(e) => setReturnReason(e.target.value)}
                          placeholder="State what needs correction"
                        />
                      </div>
                      <Button
                        variant="outline"
                        disabled={isPending || returnReason.trim().length < 3}
                        onClick={() =>
                          runAction(() => returnReportAction(props.application.id, returnReason))
                        }
                      >
                        Return report
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "scope" ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">
                  Priced repair scope {props.scope ? `(v${props.scope.version})` : ""}
                </CardTitle>
                <CardDescription>
                  {props.scope ? `Status: ${props.scope.status}` : "No scope built yet."}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Link
                  href={`/assessor/inspections/${props.application.id}`}
                  className="inline-flex min-h-9 items-center rounded-md border border-border-strong px-3 text-xs font-medium hover:bg-surface-muted"
                >
                  Open Scope Builder
                </Link>
                {props.scope && hasVariance && !props.scope.approvedBy && props.canApproveVariance ? (
                  <Button
                    size="sm"
                    variant="accent"
                    disabled={isPending}
                    onClick={() =>
                      runAction(() => approveScopeVarianceAction(props.scope!.id))
                    }
                  >
                    Approve price variance
                  </Button>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {props.scopeItems.length === 0 ? (
              <p className="text-muted-foreground">No repair scope items yet.</p>
            ) : (
              <>
                {props.scopeItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-border p-3"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">
                          {item.serviceCode} — {item.description}
                        </span>
                        <Badge variant={item.decision === "approved" ? "success" : "neutral"}>
                          {item.decision}
                        </Badge>
                        {item.varianceFlag ? (
                          <Badge variant="destructive">Variance flagged</Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Grade: {item.partGrade} ({item.partBrand ?? "N/A"}) | Parts:{" "}
                        {formatKes(item.partsKes)} | Labour: {formatKes(item.labourKes)}
                      </p>
                    </div>
                    <span className="font-semibold">{formatKes(item.lineTotalKes)}</span>
                  </div>
                ))}

                {props.scope ? (
                  <div className="rounded-md bg-surface-muted p-4 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>{formatKes(props.scope.subtotalKes)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">VAT (16%)</span>
                      <span>{formatKes(props.scope.vatKes)}</span>
                    </div>
                    <div className="flex justify-between border-t border-border pt-2 font-bold">
                      <span>Total</span>
                      <span>{formatKes(props.scope.totalKes)}</span>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "documents" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Customer documents review</CardTitle>
            <CardDescription>
              Inspect each uploaded file, then Approve or Reject with a reason code. Rejecting a
              document notifies the customer to re-upload.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {props.checklistDocs.map((doc) => (
              <div key={doc.docType} className="space-y-2 rounded-md border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">
                        {DOC_TYPE_LABELS[doc.docType] ?? doc.docType}
                      </span>
                      <Badge
                        variant={
                          doc.upload?.status === "approved"
                            ? "success"
                            : doc.upload?.status === "rejected"
                              ? "destructive"
                              : doc.upload?.status === "uploaded"
                                ? "brand"
                                : "neutral"
                        }
                      >
                        {doc.upload?.status ?? "missing"}
                      </Badge>
                    </div>
                    {doc.filePassword ? (
                      <p className="text-xs font-mono text-muted-foreground">
                        PDF password supplied: {doc.filePassword}
                      </p>
                    ) : null}
                    {doc.latestReview?.decision === "rejected" ? (
                      <p className="text-xs text-destructive">
                        Last rejection: {doc.latestReview.reasonCode}{" "}
                        {doc.latestReview.note ? `— ${doc.latestReview.note}` : ""}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {doc.upload ? (
                      <>
                        <a
                          href={`/api/files/${doc.upload.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-9 items-center gap-1 rounded-md border border-border-strong px-3 text-xs font-medium hover:bg-surface-muted"
                        >
                          View file
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                        </a>
                        {doc.upload.status !== "approved" ? (
                          <Button
                            size="sm"
                            disabled={isPending}
                            onClick={() =>
                              runAction(() =>
                                reviewDocumentAction({
                                  uploadId: doc.upload!.id,
                                  decision: "approved",
                                }),
                              )
                            }
                          >
                            Approve
                          </Button>
                        ) : null}
                        {doc.upload.status !== "rejected" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={() =>
                              setRejectingUploadId(
                                rejectingUploadId === doc.upload!.id ? null : doc.upload!.id,
                              )
                            }
                          >
                            Reject
                          </Button>
                        ) : null}
                      </>
                    ) : doc.uploadedBy === "ops" ? (
                      <label className="inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-border-strong px-3 text-xs font-medium hover:bg-surface-muted">
                        <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                        Upload confirmation
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          onChange={(e) =>
                            void handleOpsUpload(doc.docType, e.target.files?.[0] ?? null)
                          }
                          className="sr-only"
                        />
                      </label>
                    ) : (
                      <span className="text-xs text-muted-foreground">Awaiting customer upload</span>
                    )}
                  </div>
                </div>

                {doc.upload && rejectingUploadId === doc.upload.id ? (
                  <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-3">
                    <select
                      value={rejectReasonCode}
                      onChange={(e) => setRejectReasonCode(e.target.value)}
                      className="min-h-10 rounded-md border border-border-strong bg-surface px-2.5 text-xs"
                    >
                      {REJECTION_REASON_CODES.map((rc) => (
                        <option key={rc.code} value={rc.code}>
                          {rc.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      placeholder="Note for customer (optional)"
                      className="min-h-10 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={isPending}
                      onClick={() => {
                        const targetId = doc.upload!.id;
                        setRejectingUploadId(null);
                        runAction(() =>
                          reviewDocumentAction({
                            uploadId: targetId,
                            decision: "rejected",
                            reasonCode: rejectReasonCode,
                            note: rejectNote,
                          }),
                        );
                      }}
                    >
                      Confirm reject
                    </Button>
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {tab === "forward" ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ops checklist and price check</CardTitle>
              <CardDescription>Confirm every check before forwarding to the lender.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={namesMatch}
                  onChange={(e) => setNamesMatch(e.target.checked)}
                  className="h-4 w-4 accent-foreground"
                />
                Names match across account, national ID, and supporting records
              </label>
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={nothingMissing}
                  onChange={(e) => setNothingMissing(e.target.checked)}
                  className="h-4 w-4 accent-foreground"
                />
                All required documents are present and complete
              </label>
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={legible}
                  onChange={(e) => setLegible(e.target.checked)}
                  className="h-4 w-4 accent-foreground"
                />
                Every uploaded document is clear and legible
              </label>
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={priceCheckPassed}
                  onChange={(e) => setPriceCheckPassed(e.target.checked)}
                  className="h-4 w-4 accent-foreground"
                />
                Repair scope pricing checked against service catalogue
              </label>
              {props.application.productCode === "SALARIED" ? (
                <>
                  <label className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={eligibilityChecked}
                      onChange={(e) => setEligibilityChecked(e.target.checked)}
                      className="h-4 w-4 accent-foreground"
                    />
                    Employer eligibility list verified
                  </label>
                  <label className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={deductionHeadroomChecked}
                      onChange={(e) => setDeductionHeadroomChecked(e.target.checked)}
                      className="h-4 w-4 accent-foreground"
                    />
                    Payroll deduction headroom verified
                  </label>
                </>
              ) : null}

              <Button
                className="mt-2"
                disabled={isPending}
                onClick={() =>
                  runAction(() =>
                    saveOpsChecklistAction({
                      applicationId: props.application.id,
                      namesMatch,
                      nothingMissing,
                      legible,
                      eligibilityChecked,
                      deductionHeadroomChecked,
                      priceCheckPassed,
                    }),
                  )
                }
              >
                Save checklist
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Forward package to financing partner</CardTitle>
              <CardDescription>
                Destination lender (server-resolved): {props.lender?.name ?? "None assigned"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <ul className="space-y-2">
                {[
                  { label: "Status is UNDER_REVIEW", ok: props.gates.statusIsUnderReview },
                  { label: "Repair scope signed by customer", ok: props.gates.scopeSigned },
                  { label: "Price variance cleared", ok: props.gates.varianceApproved },
                  { label: "Every required document approved", ok: props.gates.allRequiredDocsApproved },
                  { label: "Ops checklist & price check passed", ok: props.gates.opsChecklistPassed },
                  { label: "Financing partner assigned", ok: props.gates.lenderResolved },
                ].map((g) => (
                  <li key={g.label} className="flex items-center gap-2">
                    {g.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                    ) : (
                      <XCircle className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                    )}
                    <span className={g.ok ? "text-foreground" : "text-muted-foreground"}>
                      {g.label}
                    </span>
                  </li>
                ))}
              </ul>

              <Button
                variant="accent"
                className="w-full"
                disabled={isPending || !props.canForward}
                onClick={() => runAction(() => forwardToLenderAction(props.application.id))}
              >
                {isPending
                  ? "Forwarding..."
                  : `Forward immutable package to ${props.lender?.name ?? "lender"}`}
              </Button>

              {props.submissions.length > 0 ? (
                <div className="space-y-1.5 border-t border-border pt-3 text-xs">
                  <p className="font-semibold">Previous submissions</p>
                  {props.submissions.map((s) => (
                    <p key={s.id} className="text-muted-foreground">
                      Package v{s.packageVersion} — {s.status} ({s.submittedAtFormatted})
                    </p>
                  ))}
                </div>
              ) : null}

              {props.application.status === "UNDER_REVIEW" ? (
                <div className="space-y-2 border-t border-border pt-3">
                  <Label htmlFor="cashRouteReason">Or move to cash/deposit route</Label>
                  <div className="flex gap-2">
                    <Input
                      id="cashRouteReason"
                      value={cashRouteReason}
                      onChange={(e) => setCashRouteReason(e.target.value)}
                      placeholder="Reason (e.g. customer opted to pay cash)"
                      className="min-h-10 text-xs"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={() =>
                        runAction(() =>
                          moveToCashRouteAction(props.application.id, cashRouteReason),
                        )
                      }
                    >
                      Cash route
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === "timeline" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Audit timeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {props.history.map((h) => (
              <div
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2 last:border-b-0"
              >
                <div>
                  <span className="font-medium">
                    {h.fromStatus ? `${h.fromStatus} -> ${h.toStatus}` : h.toStatus}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">({h.actorType})</span>
                  {h.reason ? <p className="text-xs text-muted-foreground">{h.reason}</p> : null}
                </div>
                <span className="text-xs text-muted-foreground">{h.createdAtFormatted}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
