"use client";

import { ArrowLeft, Camera, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_VAT_RATE_PCT } from "@/lib/constants";
import { formatKes } from "@/lib/format";
import {
  DIAGNOSTICS_OPTIONS,
  PHOTO_KINDS,
  URGENCY_OPTIONS,
  VEHICLE_COMPONENTS,
} from "@/server/domain/inspections/constants";
import { saveInspectionAction, saveRepairScopeAction } from "../../actions";

interface CatalogueServiceItem {
  id: string;
  code: string;
  name: string;
  category: string;
  descriptionTemplate: string;
  labourMinKes: number;
  labourMaxKes: number;
  parts: Array<{
    id: string;
    grade: string;
    brand: string;
    priceMinKes: number;
    priceMaxKes: number;
  }>;
}

interface InitialFinding {
  componentCode: string;
  componentLabel: string;
  findingText: string;
  recommendedAction: string;
  urgency:
    | "do_not_delay"
    | "within_1_month"
    | "with_the_above"
    | "three_to_four_months"
    | "monitor"
    | "no_action";
}

interface InitialScopeLine {
  id?: string;
  serviceId: string;
  description: string;
  partGrade: "OEM" | "aftermarket" | "none";
  partBrand: string;
  partsKes: number;
  labourKes: number;
  decision?: string;
}

interface WorkspaceProps {
  application: {
    id: string;
    reference: string | null;
    status: string;
    productCode: string;
    faultDescription: string | null;
  };
  vehicle: {
    regNo: string;
    makeModel: string;
    year: number | null;
  } | null;
  customer: {
    name: string;
    phoneNumber: string | null;
  } | null;
  booking: {
    slotStartFormatted: string;
    garageLabel: string;
  } | null;
  inspection: {
    id: string;
    status: string;
    mileageKm: number | null;
    durationMinutes: number | null;
    diagnosticsRun: string[];
    faultCodes: string[];
    fuelTransmissionNote: string | null;
    returnNotes: string | null;
  } | null;
  initialFindings: InitialFinding[];
  existingPhotosCount: number;
  scope: {
    id: string;
    version: number;
    status: string;
    subtotalKes: number;
    vatKes: number;
    totalKes: number;
  } | null;
  initialScopeItems: InitialScopeLine[];
  catalogue: CatalogueServiceItem[];
}

export function InspectionWorkspace({
  application,
  vehicle,
  customer,
  booking,
  inspection,
  initialFindings,
  existingPhotosCount,
  scope,
  initialScopeItems,
  catalogue,
}: WorkspaceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<"inspection" | "scope">(
    inspection && inspection.status !== "draft" ? "scope" : "inspection",
  );
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(
    null,
  );

  // Inspection state
  const [mileageKm, setMileageKm] = useState<string>(
    inspection?.mileageKm !== null && inspection?.mileageKm !== undefined
      ? String(inspection.mileageKm)
      : "",
  );
  const [durationMinutes, setDurationMinutes] = useState<string>(
    String(inspection?.durationMinutes ?? 45),
  );
  const [diagnosticsRun, setDiagnosticsRun] = useState<string[]>(
    inspection?.diagnosticsRun ?? ["OBD-II electronic scan", "Road test"],
  );
  const [faultCodesText, setFaultCodesText] = useState<string>(
    (inspection?.faultCodes ?? []).join(", "),
  );
  const [fuelTransmissionNote, setFuelTransmissionNote] = useState<string>(
    inspection?.fuelTransmissionNote ?? "",
  );
  const [findings, setFindings] = useState<InitialFinding[]>(
    initialFindings.length > 0
      ? initialFindings
      : [
          {
            componentCode: VEHICLE_COMPONENTS[0].code,
            componentLabel: VEHICLE_COMPONENTS[0].label,
            findingText: application.faultDescription ?? "",
            recommendedAction: "",
            urgency: "do_not_delay",
          },
        ],
  );
  const [capturedPhotos, setCapturedPhotos] = useState<
    Array<{ kind: string; name: string; storageKey: string; capturedAtIso: string; sha256: string }>
  >([]);

  // Scope state
  const defaultService = catalogue[0];
  const [scopeLines, setScopeLines] = useState<InitialScopeLine[]>(() => {
    if (initialScopeItems.length > 0) return initialScopeItems;
    if (!defaultService) return [];
    const defaultPart = defaultService.parts[0];
    return [
      {
        serviceId: defaultService.id,
        description: defaultService.descriptionTemplate,
        partGrade: (defaultPart?.grade as "OEM" | "aftermarket" | "none") ?? "OEM",
        partBrand: defaultPart?.brand ?? "",
        partsKes: defaultPart?.priceMinKes ?? 0,
        labourKes: defaultService.labourMinKes,
      },
    ];
  });

  const isScopeLocked = scope?.status === "signed";
  const isInspectionSubmitted = Boolean(inspection && inspection.status !== "draft");

  const scopeTotals = useMemo(() => {
    const subtotalKes = scopeLines.reduce(
      (sum, line) => sum + (Number(line.partsKes) || 0) + (Number(line.labourKes) || 0),
      0,
    );
    const vatKes = Math.round((subtotalKes * DEFAULT_VAT_RATE_PCT) / 100);
    return { subtotalKes, vatKes, totalKes: subtotalKes + vatKes };
  }, [scopeLines]);

  function toggleDiagnostic(item: string) {
    setDiagnosticsRun((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item],
    );
  }

  function addFindingRow() {
    setFindings((prev) => [
      ...prev,
      {
        componentCode: VEHICLE_COMPONENTS[0].code,
        componentLabel: VEHICLE_COMPONENTS[0].label,
        findingText: "",
        recommendedAction: "",
        urgency: "within_1_month",
      },
    ]);
  }

  function updateFinding(index: number, patch: Partial<InitialFinding>) {
    setFindings((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row)),
    );
  }

  function removeFinding(index: number) {
    setFindings((prev) => prev.filter((_, idx) => idx !== index));
  }

  async function handlePhotoCapture(kind: string, file: File | null) {
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const sha256 = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const capturedAtIso = new Date().toISOString();
    const storageKey = `inspections/${application.id}/${kind}/${sha256.slice(0, 12)}-${file.name}`;
    setCapturedPhotos((prev) => [...prev, { kind, name: file.name, storageKey, capturedAtIso, sha256 }]);
  }

  function handleSaveInspection(submitReport: boolean) {
    setFeedback(null);
    const faultCodes = faultCodesText
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    startTransition(async () => {
      const res = await saveInspectionAction({
        applicationId: application.id,
        mileageKm: Number(mileageKm) || 0,
        durationMinutes: Number(durationMinutes) || 45,
        diagnosticsRun,
        faultCodes,
        fuelTransmissionNote,
        findings,
        photos: capturedPhotos.map((p) => ({
          kind: p.kind,
          storageKey: p.storageKey,
          capturedAtIso: p.capturedAtIso,
          sha256: p.sha256,
        })),
        submitReport,
      });

      if (!res.ok) {
        setFeedback({ kind: "error", text: res.error ?? "Could not save inspection." });
        return;
      }

      setCapturedPhotos([]);
      setFeedback({
        kind: "success",
        text: res.message ?? "Saved.",
      });
      if (submitReport) {
        setActiveTab("scope");
      }
      router.refresh();
    });
  }

  function addScopeLine() {
    if (!defaultService) return;
    const defaultPart = defaultService.parts[0];
    setScopeLines((prev) => [
      ...prev,
      {
        serviceId: defaultService.id,
        description: defaultService.descriptionTemplate,
        partGrade: (defaultPart?.grade as "OEM" | "aftermarket" | "none") ?? "OEM",
        partBrand: defaultPart?.brand ?? "",
        partsKes: defaultPart?.priceMinKes ?? 0,
        labourKes: defaultService.labourMinKes,
      },
    ]);
  }

  function updateScopeLine(index: number, patch: Partial<InitialScopeLine>) {
    setScopeLines((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row)),
    );
  }

  function handleServiceChange(index: number, serviceId: string) {
    const svc = catalogue.find((c) => c.id === serviceId);
    if (!svc) return;
    const part = svc.parts[0];
    updateScopeLine(index, {
      serviceId: svc.id,
      description: svc.descriptionTemplate,
      partGrade: (part?.grade as "OEM" | "aftermarket" | "none") ?? "none",
      partBrand: part?.brand ?? "",
      partsKes: part?.priceMinKes ?? 0,
      labourKes: svc.labourMinKes,
    });
  }

  function handleGradeChange(index: number, grade: "OEM" | "aftermarket" | "none") {
    const line = scopeLines[index];
    const svc = catalogue.find((c) => c.id === line?.serviceId);
    const matchingPart = svc?.parts.find((p) => p.grade === grade);
    updateScopeLine(index, {
      partGrade: grade,
      partBrand: matchingPart?.brand ?? "",
      partsKes: grade === "none" ? 0 : (matchingPart?.priceMinKes ?? line.partsKes),
    });
  }

  function removeScopeLine(index: number) {
    setScopeLines((prev) => prev.filter((_, idx) => idx !== index));
  }

  function handleSaveScope(sendToCustomer: boolean) {
    setFeedback(null);
    startTransition(async () => {
      const res = await saveRepairScopeAction({
        applicationId: application.id,
        items: scopeLines.map((line) => ({
          serviceId: line.serviceId,
          description: line.description,
          partGrade: line.partGrade,
          partBrand: line.partBrand,
          partsKes: Number(line.partsKes) || 0,
          labourKes: Number(line.labourKes) || 0,
        })),
        sendToCustomer,
      });

      if (!res.ok) {
        setFeedback({ kind: "error", text: res.error ?? "Could not save repair scope." });
        return;
      }

      setFeedback({
        kind: "success",
        text: res.message ?? "Repair scope saved.",
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/assessor"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Assessor Dashboard
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="brand">{application.reference ?? "Draft"}</Badge>
          <Badge variant="accent">{application.status}</Badge>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">
            {vehicle ? `${vehicle.regNo} — ${vehicle.makeModel}` : "Vehicle details"}
            {vehicle?.year ? ` (${vehicle.year})` : ""}
          </CardTitle>
          <CardDescription>
            Customer: {customer?.name ?? "Unknown"}
            {customer?.phoneNumber ? ` (${customer.phoneNumber})` : ""}
            {booking ? ` | Slot: ${booking.slotStartFormatted} | ${booking.garageLabel}` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <span className="text-muted-foreground">Reported fault: </span>
          <span className="font-medium">{application.faultDescription ?? "None recorded"}</span>
        </CardContent>
      </Card>

      {inspection?.returnNotes ? (
        <Alert variant="warning">Returned notes: {inspection.returnNotes}</Alert>
      ) : null}

      {feedback ? (
        <Alert variant={feedback.kind === "error" ? "error" : "success"}>{feedback.text}</Alert>
      ) : null}

      <div className="flex gap-2 border-b border-border pb-3" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "inspection"}
          onClick={() => setActiveTab("inspection")}
          className={`min-h-10 rounded-md px-4 text-sm font-medium cursor-pointer ${
            activeTab === "inspection"
              ? "bg-brand text-brand-foreground"
              : "bg-surface text-muted-foreground border border-border hover:bg-surface-muted"
          }`}
        >
          1. Diagnostic Inspection Report
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "scope"}
          onClick={() => setActiveTab("scope")}
          className={`min-h-10 rounded-md px-4 text-sm font-medium cursor-pointer ${
            activeTab === "scope"
              ? "bg-accent text-accent-foreground"
              : "bg-surface text-muted-foreground border border-border hover:bg-surface-muted"
          }`}
        >
          2. Approved Repair Scope
        </button>
      </div>

      {activeTab === "inspection" ? (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Vehicle check-in and diagnostics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="mileageKm">Odometer mileage (km)</Label>
                  <Input
                    id="mileageKm"
                    type="number"
                    min={0}
                    value={mileageKm}
                    onChange={(e) => setMileageKm(e.target.value)}
                    placeholder="e.g. 142500"
                    disabled={isInspectionSubmitted}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="durationMinutes">Inspection duration (minutes)</Label>
                  <Input
                    id="durationMinutes"
                    type="number"
                    min={5}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    disabled={isInspectionSubmitted}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="faultCodes">OBD fault codes (comma-separated)</Label>
                  <Input
                    id="faultCodes"
                    type="text"
                    value={faultCodesText}
                    onChange={(e) => setFaultCodesText(e.target.value)}
                    placeholder="e.g. P0325, P0301"
                    disabled={isInspectionSubmitted}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Diagnostics run</Label>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {DIAGNOSTICS_OPTIONS.map((opt) => (
                    <label key={opt} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={diagnosticsRun.includes(opt)}
                        onChange={() => toggleDiagnostic(opt)}
                        disabled={isInspectionSubmitted}
                        className="h-4 w-4 accent-foreground"
                      />
                      <span>{opt}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fuelTransmissionNote">Engine, fuel, and transmission notes</Label>
                <textarea
                  id="fuelTransmissionNote"
                  rows={2}
                  value={fuelTransmissionNote}
                  onChange={(e) => setFuelTransmissionNote(e.target.value)}
                  disabled={isInspectionSubmitted}
                  placeholder="Condition of engine oil, coolant, clutch bite, and gear shifts"
                  className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Diagnostic findings</CardTitle>
                  <CardDescription>Record each fault found and its urgency.</CardDescription>
                </div>
                {!isInspectionSubmitted ? (
                  <Button variant="outline" size="sm" onClick={addFindingRow}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add finding
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {findings.map((finding, idx) => (
                <div
                  key={idx}
                  className="space-y-3 rounded-md border border-border bg-surface-muted/40 p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">
                      Finding #{idx + 1}
                    </span>
                    {!isInspectionSubmitted && findings.length > 1 ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFinding(idx)}
                        aria-label={`Remove finding ${idx + 1}`}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      </Button>
                    ) : null}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Component</Label>
                      <select
                        value={finding.componentCode}
                        disabled={isInspectionSubmitted}
                        onChange={(e) => {
                          const comp = VEHICLE_COMPONENTS.find((c) => c.code === e.target.value);
                          if (comp) {
                            updateFinding(idx, {
                              componentCode: comp.code,
                              componentLabel: comp.label,
                            });
                          }
                        }}
                        className="flex min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm"
                      >
                        {VEHICLE_COMPONENTS.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <Label>Urgency</Label>
                      <select
                        value={finding.urgency}
                        disabled={isInspectionSubmitted}
                        onChange={(e) =>
                          updateFinding(idx, {
                            urgency: e.target.value as InitialFinding["urgency"],
                          })
                        }
                        className="flex min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm"
                      >
                        {URGENCY_OPTIONS.map((u) => (
                          <option key={u.value} value={u.value}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Finding detail</Label>
                      <Input
                        value={finding.findingText}
                        disabled={isInspectionSubmitted}
                        onChange={(e) => updateFinding(idx, { findingText: e.target.value })}
                        placeholder="Describe observed defect"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Recommended action</Label>
                      <Input
                        value={finding.recommendedAction}
                        disabled={isInspectionSubmitted}
                        onChange={(e) => updateFinding(idx, { recommendedAction: e.target.value })}
                        placeholder="e.g. Replace worn engine mount and inspect bearings"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Photographic record ({existingPhotosCount + capturedPhotos.length} captured)
              </CardTitle>
              <CardDescription>
                Capture required vehicle angles, odometer, and fault close-ups.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PHOTO_KINDS.map((pk) => {
                const match = capturedPhotos.find((p) => p.kind === pk.value);
                return (
                  <label
                    key={pk.value}
                    className="flex cursor-pointer flex-col gap-1.5 rounded-md border border-dashed border-border-strong p-3 text-xs hover:bg-surface-muted/60"
                  >
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                      {pk.label}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      disabled={isInspectionSubmitted}
                      onChange={(e) => void handlePhotoCapture(pk.value, e.target.files?.[0] ?? null)}
                      className="text-xs"
                    />
                    {match ? (
                      <span className="text-success font-medium">Ready: {match.name}</span>
                    ) : null}
                  </label>
                );
              })}
            </CardContent>
          </Card>

          {!isInspectionSubmitted ? (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => handleSaveInspection(false)}
                disabled={isPending}
              >
                {isPending ? "Saving..." : "Save Draft"}
              </Button>
              <Button onClick={() => handleSaveInspection(true)} disabled={isPending}>
                {isPending ? "Submitting..." : "Submit Diagnostic Report"}
              </Button>
            </div>
          ) : (
            <Alert variant="success">
              Diagnostic report submitted. Proceed to Tab 2 (Approved Repair Scope) to price and
              send the repair scope.
            </Alert>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {!inspection ? (
            <Alert variant="warning">
              Save or submit the Diagnostic Inspection Report on Tab 1 before sending a repair
              scope to the customer.
            </Alert>
          ) : null}

          {isScopeLocked ? (
            <Alert variant="success">
              This repair scope has been signed by the customer and is now immutable.
            </Alert>
          ) : null}

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    Approved Repair Scope {scope ? `(v${scope.version} — ${scope.status})` : "(New)"}
                  </CardTitle>
                  <CardDescription>
                    Select services from the catalogue, choose parts grade, and confirm labour.
                  </CardDescription>
                </div>
                {!isScopeLocked ? (
                  <Button variant="outline" size="sm" onClick={addScopeLine}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add repair item
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {scopeLines.map((line, idx) => {
                const svc = catalogue.find((c) => c.id === line.serviceId);
                const partBand = svc?.parts.find((p) => p.grade === line.partGrade);
                const lineTotal = (Number(line.partsKes) || 0) + (Number(line.labourKes) || 0);

                return (
                  <div
                    key={idx}
                    className="space-y-3 rounded-md border border-border bg-surface-muted/40 p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase text-muted-foreground">
                          Line #{idx + 1}
                        </span>
                        {line.decision === "deferred" ? (
                          <Badge variant="neutral">Deferred by customer</Badge>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold">{formatKes(lineTotal)}</span>
                        {!isScopeLocked && scopeLines.length > 1 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeScopeLine(idx)}
                            aria-label={`Remove line ${idx + 1}`}
                          >
                            <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1 sm:col-span-2">
                        <Label>Catalogue service</Label>
                        <select
                          value={line.serviceId}
                          disabled={isScopeLocked}
                          onChange={(e) => handleServiceChange(idx, e.target.value)}
                          className="flex min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm"
                        >
                          {catalogue.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.code} — {c.name} ({c.category})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <Label>Parts grade</Label>
                        <select
                          value={line.partGrade}
                          disabled={isScopeLocked}
                          onChange={(e) =>
                            handleGradeChange(idx, e.target.value as "OEM" | "aftermarket" | "none")
                          }
                          className="flex min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm"
                        >
                          <option value="OEM">OEM</option>
                          <option value="aftermarket">Aftermarket</option>
                          <option value="none">No parts (labour only)</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label>Work authorised description</Label>
                      <Input
                        value={line.description}
                        disabled={isScopeLocked}
                        onChange={(e) => updateScopeLine(idx, { description: e.target.value })}
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label>Part brand</Label>
                        <Input
                          value={line.partBrand}
                          disabled={isScopeLocked || line.partGrade === "none"}
                          onChange={(e) => updateScopeLine(idx, { partBrand: e.target.value })}
                          placeholder="e.g. Aisin, KYB"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label>
                          Parts (KES)
                          {partBand
                            ? ` [${formatKes(partBand.priceMinKes)} - ${formatKes(partBand.priceMaxKes)}]`
                            : ""}
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          value={line.partsKes}
                          disabled={isScopeLocked || line.partGrade === "none"}
                          onChange={(e) =>
                            updateScopeLine(idx, { partsKes: Math.max(0, Number(e.target.value) || 0) })
                          }
                        />
                      </div>

                      <div className="space-y-1">
                        <Label>
                          Labour (KES)
                          {svc
                            ? ` [${formatKes(svc.labourMinKes)} - ${formatKes(svc.labourMaxKes)}]`
                            : ""}
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          value={line.labourKes}
                          disabled={isScopeLocked}
                          onChange={(e) =>
                            updateScopeLine(idx, { labourKes: Math.max(0, Number(e.target.value) || 0) })
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="rounded-md border border-border bg-surface p-4 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatKes(scopeTotals.subtotalKes)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT ({DEFAULT_VAT_RATE_PCT}%)</span>
                  <span>{formatKes(scopeTotals.vatKes)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
                  <span>Total repair cost</span>
                  <span>{formatKes(scopeTotals.totalKes)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {!isScopeLocked ? (
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => handleSaveScope(false)}
                disabled={isPending}
              >
                {isPending ? "Saving..." : "Save Scope Draft"}
              </Button>
              <Button
                variant="accent"
                onClick={() => handleSaveScope(true)}
                disabled={isPending || !inspection}
              >
                {isPending ? "Sending..." : "Send Approved Repair Scope to Customer"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
