"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  confirmSecondApprovalAction,
  decideSubmissionAction,
  recordLenderApprovalAction,
  submitManualRepaymentAction,
} from "../../actions";

export interface LenderPackageProps {
  viewerEmail: string;
  viewerUserId: string;
  viewedAtFormatted: string;
  isApprover: boolean;
  makerCheckerThresholdKes: number | null;
  application: {
    id: string;
    reference: string;
    status: string;
    substatus: string | null;
    productCode: "RIDE_HAILING" | "SALARIED";
    depositKes: number;
  };
  submission: {
    id: string;
    packageVersion: number;
    status: string;
    submittedAtFormatted: string;
    slaDueAtFormatted: string | null;
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
  financedAmountKes: number;
  signedScope: {
    version: number;
    subtotalKes: number;
    vatKes: number;
    totalKes: number;
    vatRatePct: number;
  } | null;
  signedScopeItems: Array<{
    id: string;
    serviceCode: string;
    description: string;
    partGrade: string;
    partBrand: string | null;
    partsKes: number;
    labourKes: number;
    lineTotalKes: number;
    decision: string;
  }>;
  findings: Array<{
    id: string;
    componentLabel: string;
    findingText: string;
    recommendedAction: string | null;
    urgency: string;
  }>;
  approvedUploads: Array<{
    id: string;
    docType: string;
    mime: string;
    sizeBytes: number;
  }>;
  documents: Array<{
    id: string;
    type: string;
    docNumber: string;
    pdfSha256: string | null;
    issuedAtFormatted: string | null;
  }>;
  decisions: Array<{
    id: string;
    decision: string;
    approvedAmountKes: number | null;
    installmentKes: number | null;
    frequency: string | null;
    tenorCount: number | null;
    totalPayableKes: number | null;
    rateText: string | null;
    feesText: string | null;
    declineReasonCode: string | null;
    note: string | null;
    validUntilFormatted: string | null;
    createdAtFormatted: string;
  }>;
  latestOffer: {
    id: string;
    customerResponse: string;
    respondedAtFormatted: string | null;
  } | null;
  repaymentTerms: {
    frequency: string;
    installmentKes: number;
    tenorCount: number;
    firstDueDate: string;
    totalPayableKes: number;
  } | null;
  attestations: Array<{
    id: string;
    kind: "lender_approval" | "funds_received";
    amountKes: number;
    reference: string;
    expectedDate: string | null;
    discrepancyFlag: boolean;
    recordedBy: string;
    secondApproverId: string | null;
    recordedAtFormatted: string;
  }>;
  repaymentReports: Array<{
    id: string;
    asOfDate: string;
    state: string;
    installmentsPaid: number;
    installmentsMissed: number;
    source: string;
    note: string | null;
    createdAtFormatted: string;
  }>;
  history: Array<{
    id: string;
    toStatus: string;
    reason: string | null;
    createdAtFormatted: string;
  }>;
}

const DECLINE_REASONS = [
  { value: "affordability", label: "Affordability / income coverage" },
  { value: "kyc_mismatch", label: "KYC / document mismatch" },
  { value: "credit_bureau", label: "Credit bureau / repayment history" },
  { value: "policy_exclusion", label: "Outside lender credit policy" },
  { value: "other", label: "Other (specify in note)" },
];

function kes(n: number) {
  return `KES ${n.toLocaleString("en-KE")}`;
}

function defaultValidUntilDate() {
  const d = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function LenderPackageWorkspace(props: LenderPackageProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Decision panel state
  const lockedFreq = props.application.productCode === "RIDE_HAILING" ? "daily" : "monthly";
  const defaultTenor = props.application.productCode === "RIDE_HAILING" ? 30 : 3;
  const defaultInstallment =
    props.financedAmountKes > 0
      ? Math.ceil((props.financedAmountKes * 1.15) / defaultTenor)
      : 1000;

  const [decisionMode, setDecisionMode] = useState<"approve" | "decline" | "request_info">("approve");
  const [approvedAmountKes, setApprovedAmountKes] = useState(
    String(props.financedAmountKes > 0 ? props.financedAmountKes : 10000),
  );
  const [installmentKes, setInstallmentKes] = useState(String(defaultInstallment));
  const [tenorCount, setTenorCount] = useState(String(defaultTenor));
  const [rateText, setRateText] = useState("Standard financing facility rate");
  const [feesText, setFeesText] = useState("Facility fee included in instalment");
  const [validUntilDate, setValidUntilDate] = useState(defaultValidUntilDate);
  const [declineReasonCode, setDeclineReasonCode] = useState("affordability");
  const [decisionNote, setDecisionNote] = useState("");

  // Payment approval state
  const latestApprovedDecision = props.decisions.find((d) => d.decision === "approve");
  const defaultApprovalAmount =
    latestApprovedDecision?.approvedAmountKes ?? props.financedAmountKes;
  const [approvalAmountKes, setApprovalAmountKes] = useState(String(defaultApprovalAmount || 0));
  const [approvalRef, setApprovalRef] = useState("");
  const [approvalDate, setApprovalDate] = useState(todayDate);

  // Manual repayment state
  const [repDate, setRepDate] = useState(todayDate);
  const [repState, setRepState] = useState<"current" | "catch_up" | "arrears" | "settled">("current");
  const [repPaid, setRepPaid] = useState("1");
  const [repMissed, setRepMissed] = useState("0");
  const [repNote, setRepNote] = useState("");

  const parsedApproved = Number(approvedAmountKes) || 0;
  const parsedInstallment = Number(installmentKes) || 0;
  const parsedTenor = Number(tenorCount) || 0;
  const computedTotalPayable = Math.round(parsedInstallment) * Math.round(parsedTenor);
  const totalTooLow = parsedApproved > 0 && computedTotalPayable < parsedApproved;

  const lenderApprovalAtt = props.attestations.find((a) => a.kind === "lender_approval");
  const fundsReceivedAtt = props.attestations.find((a) => a.kind === "funds_received");
  const needsSecondApproval = Boolean(
    lenderApprovalAtt &&
      props.makerCheckerThresholdKes &&
      lenderApprovalAtt.amountKes > props.makerCheckerThresholdKes &&
      !lenderApprovalAtt.secondApproverId,
  );
  const canConfirmSecondApproval =
    needsSecondApproval &&
    props.isApprover &&
    lenderApprovalAtt?.recordedBy !== props.viewerUserId;

  function handleDecisionSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const validUntilIso = validUntilDate ? `${validUntilDate}T20:59:59.000Z` : undefined;
      const res = await decideSubmissionAction({
        submissionId: props.submission.id,
        decision: decisionMode,
        approvedAmountKes: decisionMode === "approve" ? Number(approvedAmountKes) : undefined,
        installmentKes: decisionMode === "approve" ? Number(installmentKes) : undefined,
        frequency: decisionMode === "approve" ? lockedFreq : undefined,
        tenorCount: decisionMode === "approve" ? Number(tenorCount) : undefined,
        rateText: decisionMode === "approve" ? rateText : undefined,
        feesText: decisionMode === "approve" ? feesText : undefined,
        validUntilIso: decisionMode === "approve" ? validUntilIso : undefined,
        declineReasonCode: decisionMode === "decline" ? declineReasonCode : undefined,
        note: decisionNote || undefined,
      });
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error ?? "Decision failed." });
        return;
      }
      setFeedback({ type: "success", text: res.message ?? "Decision saved." });
      router.refresh();
    });
  }

  function handleRecordApproval(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const res = await recordLenderApprovalAction({
        applicationId: props.application.id,
        amountKes: Number(approvalAmountKes),
        reference: approvalRef,
        expectedDate: approvalDate,
      });
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error ?? "Failed to record payment approval." });
        return;
      }
      setFeedback({ type: "success", text: res.message ?? "Payment approval recorded." });
      router.refresh();
    });
  }

  function handleSecondApproval() {
    if (!lenderApprovalAtt) return;
    setFeedback(null);
    startTransition(async () => {
      const res = await confirmSecondApprovalAction(lenderApprovalAtt.id);
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error ?? "Failed to confirm second approval." });
        return;
      }
      setFeedback({ type: "success", text: res.message ?? "Second approval confirmed." });
      router.refresh();
    });
  }

  function handleRepaymentSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const res = await submitManualRepaymentAction({
        reference: props.application.reference,
        asOfDate: repDate,
        state: repState,
        installmentsPaid: Number(repPaid),
        installmentsMissed: Number(repMissed),
        note: repNote || undefined,
      });
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error ?? "Failed to record repayment status." });
        return;
      }
      setRepNote("");
      setFeedback({ type: "success", text: res.message ?? "Repayment status saved." });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-border bg-surface-muted px-4 py-2 text-xs text-muted-foreground">
        Confidential underwriting package | Watermark: {props.viewerEmail} | Viewed{" "}
        {props.viewedAtFormatted} | Access audit-logged
      </div>

      {feedback ? (
        <Alert variant={feedback.type === "error" ? "error" : "success"}>{feedback.text}</Alert>
      ) : null}

      {/* Top summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Applicant & vehicle</CardDescription>
            <CardTitle className="text-base">{props.customer?.name ?? "Customer"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-muted-foreground">
            <p>{props.customer?.email}</p>
            {props.customer?.phoneNumber ? <p>{props.customer.phoneNumber}</p> : null}
            <p className="pt-1 font-medium text-foreground">
              {props.vehicle
                ? `${props.vehicle.regNo} — ${props.vehicle.makeModel}${props.vehicle.year ? ` (${props.vehicle.year})` : ""}`
                : "No vehicle record"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Financing request</CardDescription>
            <CardTitle className="font-mono text-xl">{kes(props.financedAmountKes)}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-muted-foreground">
            <p>
              Product: {props.application.productCode === "RIDE_HAILING" ? "Ride-hailing (daily)" : "Salaried (monthly)"}
            </p>
            <p>
              Signed scope total:{" "}
              {props.signedScope ? kes(props.signedScope.totalKes) : "—"} | Deposit:{" "}
              {kes(props.application.depositKes)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Submission & status</CardDescription>
            <div className="flex items-center gap-2">
              <Badge variant="accent">{props.application.status}</Badge>
              {props.application.substatus ? (
                <Badge variant="neutral">{props.application.substatus}</Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-muted-foreground">
            <p>Package v{props.submission.packageVersion}</p>
            <p>Submitted: {props.submission.submittedAtFormatted}</p>
            {props.submission.slaDueAtFormatted ? (
              <p>SLA due: {props.submission.slaDueAtFormatted}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Underwriting decision panel (when WITH_LENDER) */}
      {props.application.status === "WITH_LENDER" ? (
        <Card className="border-brand/50">
          <CardHeader>
            <CardTitle className="text-base">Underwriting decision</CardTitle>
            <CardDescription>
              Approve with binding repayment terms, decline with a reason code, or request additional information from Ask AutoParts Operations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!props.isApprover ? (
              <Alert variant="info">
                Your account has read-only viewer permissions. An Approver in your organisation must submit the underwriting decision.
              </Alert>
            ) : (
              <form onSubmit={handleDecisionSubmit} className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { id: "approve", label: "Approve & make offer" },
                      { id: "decline", label: "Decline" },
                      { id: "request_info", label: "Request more info" },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setDecisionMode(mode.id)}
                      className={`rounded-md border px-3 py-1.5 text-sm font-medium cursor-pointer ${
                        decisionMode === mode.id
                          ? "border-brand bg-brand text-brand-foreground"
                          : "border-border bg-surface text-foreground hover:bg-surface-muted"
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                {decisionMode === "approve" ? (
                  <div className="space-y-4">
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="approvedAmountKes">Approved amount (KES)</Label>
                        <Input
                          id="approvedAmountKes"
                          type="number"
                          min={1}
                          required
                          value={approvedAmountKes}
                          onChange={(e) => setApprovedAmountKes(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="frequency">Repayment frequency</Label>
                        <Input
                          id="frequency"
                          value={lockedFreq === "daily" ? "Daily (Ride-hailing)" : "Monthly (Salaried)"}
                          readOnly
                          className="bg-surface-muted"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="installmentKes">
                          {lockedFreq === "daily" ? "Daily instalment (KES)" : "Monthly instalment (KES)"}
                        </Label>
                        <Input
                          id="installmentKes"
                          type="number"
                          min={1}
                          required
                          value={installmentKes}
                          onChange={(e) => setInstallmentKes(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="tenorCount">
                          {lockedFreq === "daily" ? "Tenor (days)" : "Tenor (months)"}
                        </Label>
                        <Input
                          id="tenorCount"
                          type="number"
                          min={1}
                          required
                          value={tenorCount}
                          onChange={(e) => setTenorCount(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="rounded-md border border-border bg-surface-muted px-4 py-3 text-sm">
                      <span className="text-muted-foreground">Total payable (instalment x tenor): </span>
                      <span className="font-mono font-semibold text-foreground">
                        {kes(computedTotalPayable)}
                      </span>
                      {totalTooLow ? (
                        <span className="ml-2 text-xs text-destructive">
                          Must be at least the approved amount ({kes(parsedApproved)}).
                        </span>
                      ) : null}
                    </div>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="rateText">Rate / pricing summary</Label>
                        <Input
                          id="rateText"
                          value={rateText}
                          onChange={(e) => setRateText(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="feesText">Fees disclosure</Label>
                        <Input
                          id="feesText"
                          value={feesText}
                          onChange={(e) => setFeesText(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="validUntilDate">Offer valid until</Label>
                        <Input
                          id="validUntilDate"
                          type="date"
                          required
                          value={validUntilDate}
                          onChange={(e) => setValidUntilDate(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}

                {decisionMode === "decline" ? (
                  <div className="space-y-2 max-w-md">
                    <Label htmlFor="declineReasonCode">Decline reason code</Label>
                    <select
                      id="declineReasonCode"
                      value={declineReasonCode}
                      onChange={(e) => setDeclineReasonCode(e.target.value)}
                      className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground"
                    >
                      {DECLINE_REASONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <Label htmlFor="decisionNote">
                    {decisionMode === "request_info"
                      ? "Information requested (required)"
                      : "Underwriting note (optional)"}
                  </Label>
                  <textarea
                    id="decisionNote"
                    rows={3}
                    required={decisionMode === "request_info"}
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value)}
                    placeholder={
                      decisionMode === "request_info"
                        ? "List the exact clarification or document needed from Operations..."
                        : "Optional note recorded with this decision..."
                    }
                    className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
                  />
                </div>

                <Button type="submit" disabled={isPending || (decisionMode === "approve" && totalTooLow)}>
                  {isPending
                    ? "Submitting..."
                    : decisionMode === "approve"
                      ? "Issue offer to customer"
                      : decisionMode === "decline"
                        ? "Confirm decline"
                        : "Send info request"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Offer status banner when OFFER_MADE */}
      {props.application.status === "OFFER_MADE" && props.latestOffer ? (
        <Alert variant="info">
          Offer issued and sent to the customer. Current response:{" "}
          <strong className="capitalize">{props.latestOffer.customerResponse}</strong>. Once the customer accepts and signs, record your payment approval below.
        </Alert>
      ) : null}

      {/* Payment Approval Gate Panel */}
      {["APPROVED", "REPAIR_IN_PROGRESS", "REPAYING", "SETTLED"].includes(
        props.application.status,
      ) ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment gate (off-platform settlement)</CardTitle>
            <CardDescription>
              Ask AutoParts opens the garage repair job card only when both lender payment approval and Accounts funds receipt are recorded.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-border p-4 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">1. Lender payment approval</p>
                  <Badge variant={lenderApprovalAtt ? "success" : "brand"}>
                    {lenderApprovalAtt ? "Recorded" : "Pending"}
                  </Badge>
                </div>
                {lenderApprovalAtt ? (
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <p>Amount: {kes(lenderApprovalAtt.amountKes)}</p>
                    <p>Reference: {lenderApprovalAtt.reference}</p>
                    {lenderApprovalAtt.expectedDate ? (
                      <p>Expected date: {lenderApprovalAtt.expectedDate}</p>
                    ) : null}
                    <p>Recorded: {lenderApprovalAtt.recordedAtFormatted}</p>
                    {needsSecondApproval ? (
                      <div className="pt-2">
                        <Alert variant="warning">
                          Amount exceeds maker-checker threshold ({kes(props.makerCheckerThresholdKes!)}). A second approver must confirm.
                        </Alert>
                        {canConfirmSecondApproval ? (
                          <Button
                            type="button"
                            size="sm"
                            className="mt-2"
                            disabled={isPending}
                            onClick={handleSecondApproval}
                          >
                            Confirm second approval
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : props.isApprover && props.application.status === "APPROVED" ? (
                  <form onSubmit={handleRecordApproval} className="mt-3 space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="approvalAmountKes">Approved payment amount (KES)</Label>
                      <Input
                        id="approvalAmountKes"
                        type="number"
                        min={1}
                        required
                        value={approvalAmountKes}
                        onChange={(e) => setApprovalAmountKes(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="approvalRef">Payment / EFT / RTGS reference</Label>
                      <Input
                        id="approvalRef"
                        required
                        placeholder="e.g. EFT-2026-00941"
                        value={approvalRef}
                        onChange={(e) => setApprovalRef(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="approvalDate">Expected transfer date</Label>
                      <Input
                        id="approvalDate"
                        type="date"
                        required
                        value={approvalDate}
                        onChange={(e) => setApprovalDate(e.target.value)}
                      />
                    </div>
                    <Button type="submit" size="sm" disabled={isPending}>
                      {isPending ? "Saving..." : "Record payment approval"}
                    </Button>
                  </form>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Awaiting a Lender Approver to record payment approval.
                  </p>
                )}
              </div>

              <div className="rounded-md border border-border p-4 text-sm">
                <div className="flex items-center justify-between">
                  <p className="font-semibold">2. Ask AutoParts funds receipt</p>
                  <Badge variant={fundsReceivedAtt ? "success" : "neutral"}>
                    {fundsReceivedAtt ? "Confirmed" : "Awaiting Accounts"}
                  </Badge>
                </div>
                {fundsReceivedAtt ? (
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <p>Amount received: {kes(fundsReceivedAtt.amountKes)}</p>
                    <p>Bank reference: {fundsReceivedAtt.reference}</p>
                    <p>Recorded: {fundsReceivedAtt.recordedAtFormatted}</p>
                    {fundsReceivedAtt.discrepancyFlag ? (
                      <p className="font-medium text-destructive">
                        Discrepancy flagged: amount differs from lender approval.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Ask AutoParts Accounts will confirm once funds settle in the bank account.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Signed Repair Scope */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Signed repair scope {props.signedScope ? `(v${props.signedScope.version})` : ""}
          </CardTitle>
          <CardDescription>Customer-approved parts and labour quotation.</CardDescription>
        </CardHeader>
        <CardContent>
          {props.signedScopeItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">No signed repair scope items available.</p>
          ) : (
            <div className="space-y-4">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3 font-medium">Code</th>
                      <th className="py-2 pr-3 font-medium">Description</th>
                      <th className="py-2 pr-3 font-medium">Grade / Brand</th>
                      <th className="py-2 pr-3 font-medium text-right">Parts</th>
                      <th className="py-2 pr-3 font-medium text-right">Labour</th>
                      <th className="py-2 pr-3 font-medium text-right">Line total</th>
                      <th className="py-2 font-medium text-right">Decision</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {props.signedScopeItems.map((item) => (
                      <tr key={item.id}>
                        <td className="py-2 pr-3 font-mono">{item.serviceCode}</td>
                        <td className="py-2 pr-3">{item.description}</td>
                        <td className="py-2 pr-3">
                          {item.partGrade}
                          {item.partBrand ? ` (${item.partBrand})` : ""}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono">{kes(item.partsKes)}</td>
                        <td className="py-2 pr-3 text-right font-mono">{kes(item.labourKes)}</td>
                        <td className="py-2 pr-3 text-right font-mono font-medium">
                          {kes(item.lineTotalKes)}
                        </td>
                        <td className="py-2 text-right capitalize">{item.decision}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {props.signedScope ? (
                <div className="flex flex-wrap justify-end gap-6 border-t border-border pt-3 text-xs">
                  <span>Subtotal: {kes(props.signedScope.subtotalKes)}</span>
                  <span>
                    VAT ({props.signedScope.vatRatePct}%): {kes(props.signedScope.vatKes)}
                  </span>
                  <span className="font-semibold text-foreground">
                    Total: {kes(props.signedScope.totalKes)}
                  </span>
                  <span className="font-semibold text-accent">
                    Net financed: {kes(props.financedAmountKes)}
                  </span>
                </div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Diagnostic findings & Approved customer documents */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Diagnostic findings</CardTitle>
            <CardDescription>KEMRA assessor inspection report findings.</CardDescription>
          </CardHeader>
          <CardContent>
            {props.findings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No findings recorded.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {props.findings.map((f) => (
                  <li key={f.id} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{f.componentLabel}</span>
                      <Badge
                        variant={
                          f.urgency === "critical"
                            ? "destructive"
                            : f.urgency === "recommended"
                              ? "brand"
                              : "neutral"
                        }
                      >
                        {f.urgency}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{f.findingText}</p>
                    {f.recommendedAction ? (
                      <p className="mt-1 text-xs text-foreground">
                        Recommended: {f.recommendedAction}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Verified customer documents</CardTitle>
            <CardDescription>
              Approved KYC and supporting files (every download is audit-logged).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {props.approvedUploads.length === 0 ? (
              <p className="text-sm text-muted-foreground">No approved customer uploads.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {props.approvedUploads.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                  >
                    <div>
                      <p className="font-medium">{u.docType.replaceAll("_", " ")}</p>
                      <p className="text-xs text-muted-foreground">
                        {u.mime} | {(u.sizeBytes / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <a
                      href={`/api/files/${u.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-accent hover:underline"
                    >
                      View / Download
                    </a>
                  </li>
                ))}
              </ul>
            )}

            {props.documents.length > 0 ? (
              <div className="border-t border-border pt-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">
                  Issued platform records
                </p>
                <ul className="space-y-1.5 text-xs">
                  {props.documents.map((doc) => (
                    <li key={doc.id} className="flex items-center justify-between gap-2">
                      <span className="font-mono font-medium text-foreground">{doc.docNumber}</span>
                      <span className="text-muted-foreground">
                        {doc.type}
                        {doc.pdfSha256 ? ` | ${doc.pdfSha256.slice(0, 10)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Repayment terms & status reporting */}
      {props.repaymentTerms || props.repaymentReports.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Repayment terms & status reporting</CardTitle>
            <CardDescription>
              Customer-accepted schedule and status updates reported by your organisation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {props.repaymentTerms ? (
              <div className="grid gap-3 sm:grid-cols-5 rounded-md border border-border bg-surface-muted p-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Frequency</p>
                  <p className="font-semibold capitalize">{props.repaymentTerms.frequency}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Instalment</p>
                  <p className="font-mono font-semibold">
                    {kes(props.repaymentTerms.installmentKes)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tenor</p>
                  <p className="font-semibold">{props.repaymentTerms.tenorCount}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">First due</p>
                  <p className="font-semibold">{props.repaymentTerms.firstDueDate}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total payable</p>
                  <p className="font-mono font-semibold">
                    {kes(props.repaymentTerms.totalPayableKes)}
                  </p>
                </div>
              </div>
            ) : null}

            {["REPAIR_IN_PROGRESS", "REPAYING"].includes(props.application.status) ? (
              <form
                onSubmit={handleRepaymentSubmit}
                className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-6 items-end"
              >
                <div className="space-y-1">
                  <Label htmlFor="repDate">As-of date</Label>
                  <Input
                    id="repDate"
                    type="date"
                    required
                    value={repDate}
                    onChange={(e) => setRepDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="repState">State</Label>
                  <select
                    id="repState"
                    value={repState}
                    onChange={(e) =>
                      setRepState(e.target.value as "current" | "catch_up" | "arrears" | "settled")
                    }
                    className="h-10 w-full rounded-md border border-border bg-surface px-2 text-sm"
                  >
                    <option value="current">Current</option>
                    <option value="catch_up">Catch-up</option>
                    <option value="arrears">Arrears</option>
                    <option value="settled">Settled</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="repPaid">Paid</Label>
                  <Input
                    id="repPaid"
                    type="number"
                    min={0}
                    required
                    value={repPaid}
                    onChange={(e) => setRepPaid(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="repMissed">Missed</Label>
                  <Input
                    id="repMissed"
                    type="number"
                    min={0}
                    required
                    value={repMissed}
                    onChange={(e) => setRepMissed(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="repNote">Note</Label>
                  <Input
                    id="repNote"
                    placeholder="Optional"
                    value={repNote}
                    onChange={(e) => setRepNote(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Saving..." : "Record status"}
                </Button>
              </form>
            ) : null}

            {props.repaymentReports.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3 font-medium">As-of date</th>
                      <th className="py-2 pr-3 font-medium">State</th>
                      <th className="py-2 pr-3 font-medium">Paid</th>
                      <th className="py-2 pr-3 font-medium">Missed</th>
                      <th className="py-2 pr-3 font-medium">Source</th>
                      <th className="py-2 font-medium">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {props.repaymentReports.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 pr-3 font-mono">{r.asOfDate}</td>
                        <td className="py-2 pr-3 capitalize font-medium">
                          {r.state.replace("_", " ")}
                        </td>
                        <td className="py-2 pr-3">{r.installmentsPaid}</td>
                        <td className="py-2 pr-3">{r.installmentsMissed}</td>
                        <td className="py-2 pr-3 uppercase">{r.source}</td>
                        <td className="py-2 text-muted-foreground">{r.note ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Decisions & Timeline */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Decision log</CardTitle>
          </CardHeader>
          <CardContent>
            {props.decisions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No decisions recorded yet.</p>
            ) : (
              <ul className="space-y-3 text-xs">
                {props.decisions.map((d) => (
                  <li key={d.id} className="rounded-md border border-border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <Badge
                        variant={
                          d.decision === "approve"
                            ? "success"
                            : d.decision === "decline"
                              ? "destructive"
                              : "brand"
                        }
                      >
                        {d.decision.replace("_", " ")}
                      </Badge>
                      <span className="text-muted-foreground">{d.createdAtFormatted}</span>
                    </div>
                    {d.decision === "approve" && d.approvedAmountKes ? (
                      <p className="text-foreground">
                        Approved {kes(d.approvedAmountKes)} |{" "}
                        {d.installmentKes ? kes(d.installmentKes) : "—"} {d.frequency} x{" "}
                        {d.tenorCount} (Total:{" "}
                        {d.totalPayableKes ? kes(d.totalPayableKes) : "—"})
                      </p>
                    ) : null}
                    {d.declineReasonCode ? (
                      <p className="text-destructive">Reason: {d.declineReasonCode}</p>
                    ) : null}
                    {d.note ? <p className="text-muted-foreground">{d.note}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-xs">
              {props.history.map((h) => (
                <li
                  key={h.id}
                  className="flex items-start justify-between gap-2 border-b border-border pb-2 last:border-b-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium text-foreground">{h.toStatus}</p>
                    {h.reason ? <p className="text-muted-foreground">{h.reason}</p> : null}
                  </div>
                  <span className="shrink-0 text-muted-foreground">{h.createdAtFormatted}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
