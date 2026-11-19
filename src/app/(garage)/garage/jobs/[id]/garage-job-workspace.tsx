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
  addRecommendationAction,
  checkInVehicleAction,
  deleteRecommendationAction,
  recordHandoverAction,
  updateJobLineAction,
} from "../../actions";

export interface GarageJobWorkspaceProps {
  job: {
    id: string;
    jobNo: number;
    status: string;
    mileageIn: number | null;
    mileageOut: number | null;
    arrivalChecks: Record<string, unknown>;
    openedAtFormatted: string;
    completedAtFormatted: string | null;
  };
  application: {
    id: string;
    reference: string;
    status: string;
    faultDescription: string | null;
  };
  garage: { name: string; branch: string | null } | null;
  customer: { name: string; phoneNumber: string | null; email: string } | null;
  vehicle: { regNo: string; makeModel: string; year: number | null } | null;
  lines: Array<{
    id: string;
    serviceCode: string;
    description: string;
    approvedGrade: string;
    approvedBrand: string | null;
    technicianName: string | null;
    partFitted: string | null;
    grade: string | null;
    warrantyToDate: string | null;
    warrantyToKm: number | null;
    completedAtFormatted: string | null;
  }>;
  photos: Array<{
    id: string;
    kind: string;
    createdAtFormatted: string;
  }>;
  recommendations: Array<{
    id: string;
    finding: string;
    urgency: string;
    reminderOn: string | null;
    createdAtFormatted: string;
  }>;
  handover: {
    id: string;
    roadTestKm: number | null;
    roadTestResult: string | null;
    walkthroughDone: boolean;
    partsReturned: boolean;
    nextServiceKm: number | null;
    nextServiceDate: string | null;
    handedOverAtFormatted: string | null;
  } | null;
}

const URGENCY_OPTIONS = [
  { value: "do_not_delay", label: "Do not delay (urgent)" },
  { value: "within_1_month", label: "Within 1 month" },
  { value: "with_the_above", label: "With the above work" },
  { value: "three_to_four_months", label: "Within 3 to 4 months" },
  { value: "monitor", label: "Monitor at next service" },
  { value: "no_action", label: "Advisory / no immediate action" },
];

const PHOTO_KINDS = [
  { value: "before", label: "Before repair" },
  { value: "after", label: "After repair" },
  { value: "old_parts", label: "Old parts removed" },
  { value: "alignment", label: "Alignment / test printout" },
];

function LineEditorRow({
  jobId,
  line,
  readOnly,
  onSaved,
}: {
  jobId: string;
  line: GarageJobWorkspaceProps["lines"][number];
  readOnly: boolean;
  onSaved: (msg: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [technicianName, setTechnicianName] = useState(line.technicianName ?? "");
  const [partFitted, setPartFitted] = useState(line.partFitted ?? line.approvedBrand ?? "");
  const [grade, setGrade] = useState(line.grade ?? line.approvedGrade);
  const [warrantyToDate, setWarrantyToDate] = useState(line.warrantyToDate ?? "");
  const [warrantyToKm, setWarrantyToKm] = useState(
    line.warrantyToKm ? String(line.warrantyToKm) : "",
  );
  const [completed, setCompleted] = useState(Boolean(line.completedAtFormatted));
  const [err, setErr] = useState<string | null>(null);

  function save(nextCompleted: boolean) {
    setErr(null);
    startTransition(async () => {
      const res = await updateJobLineAction({
        jobId,
        lineId: line.id,
        technicianName,
        partFitted,
        grade,
        warrantyToDate: warrantyToDate || undefined,
        warrantyToKm: warrantyToKm ? Number(warrantyToKm) : null,
        completed: nextCompleted,
      });
      if (!res.ok) {
        setErr(res.error ?? "Could not update line.");
        return;
      }
      setCompleted(nextCompleted);
      onSaved(res.message ?? "Line updated.");
      router.refresh();
    });
  }

  return (
    <div className="rounded-md border border-border p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-sm text-foreground">
            <span className="font-mono text-xs text-muted-foreground mr-2">{line.serviceCode}</span>
            {line.description}
          </p>
          <p className="text-xs text-muted-foreground">
            Approved grade: {line.approvedGrade}
            {line.approvedBrand ? ` (${line.approvedBrand})` : ""}
          </p>
        </div>
        <Badge variant={completed ? "success" : "neutral"}>
          {completed ? `Completed ${line.completedAtFormatted ?? ""}` : "Pending"}
        </Badge>
      </div>

      {err ? <Alert variant="error">{err}</Alert> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1">
          <Label htmlFor={`tech-${line.id}`}>Technician</Label>
          <Input
            id={`tech-${line.id}`}
            disabled={readOnly || isPending}
            placeholder="Mechanic name"
            value={technicianName}
            onChange={(e) => setTechnicianName(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`part-${line.id}`}>Part fitted</Label>
          <Input
            id={`part-${line.id}`}
            disabled={readOnly || isPending}
            placeholder="Part name / brand / SKU"
            value={partFitted}
            onChange={(e) => setPartFitted(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`grade-${line.id}`}>Fitted grade</Label>
          <Input
            id={`grade-${line.id}`}
            disabled={readOnly || isPending}
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`wdate-${line.id}`}>Warranty until date</Label>
          <Input
            id={`wdate-${line.id}`}
            type="date"
            disabled={readOnly || isPending}
            value={warrantyToDate}
            onChange={(e) => setWarrantyToDate(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`wkm-${line.id}`}>Warranty km</Label>
          <Input
            id={`wkm-${line.id}`}
            type="number"
            min={0}
            disabled={readOnly || isPending}
            placeholder="e.g. 10000"
            value={warrantyToKm}
            onChange={(e) => setWarrantyToKm(e.target.value)}
          />
        </div>
      </div>

      {!readOnly ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => save(completed)}>
            Save details
          </Button>
          <Button
            type="button"
            size="sm"
            variant={completed ? "outline" : "primary"}
            disabled={isPending}
            onClick={() => save(!completed)}
          >
            {completed ? "Mark pending" : "Mark line completed"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function GarageJobWorkspace(props: GarageJobWorkspaceProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeTab, setActiveTab] = useState<
    "checkin" | "scope" | "photos" | "recommendations" | "handover"
  >("scope");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const readOnly = props.job.status === "completed";
  const completedCount = props.lines.filter((l) => Boolean(l.completedAtFormatted)).length;
  const allLinesComplete = props.lines.length === 0 || completedCount === props.lines.length;

  // Tab 1: Arrival check-in state
  const ac = props.job.arrivalChecks ?? {};
  const [mileageIn, setMileageIn] = useState(
    props.job.mileageIn !== null ? String(props.job.mileageIn) : "",
  );
  const [fuelLevel, setFuelLevel] = useState(
    typeof ac.fuelLevel === "string" ? ac.fuelLevel : "Half",
  );
  const [bodyCondition, setBodyCondition] = useState(
    typeof ac.bodyCondition === "string" ? ac.bodyCondition : "Good — normal wear",
  );
  const [trackerPresent, setTrackerPresent] = useState(
    typeof ac.trackerPresent === "boolean" ? ac.trackerPresent : true,
  );
  const [spareWheel, setSpareWheel] = useState(
    typeof ac.spareWheel === "boolean" ? ac.spareWheel : true,
  );
  const [dashboardWarnings, setDashboardWarnings] = useState(
    typeof ac.dashboardWarnings === "string" ? ac.dashboardWarnings : "None",
  );
  const [arrivalNotes, setArrivalNotes] = useState(typeof ac.notes === "string" ? ac.notes : "");

  // Tab 3: Photo upload state
  const [photoKind, setPhotoKind] = useState("before");
  const [photoUploading, setPhotoUploading] = useState(false);

  // Tab 4: Recommendation state
  const [recFinding, setRecFinding] = useState("");
  const [recUrgency, setRecUrgency] = useState("within_1_month");
  const [recReminderOn, setRecReminderOn] = useState("");

  // Tab 5: Handover state
  const [mileageOut, setMileageOut] = useState(
    props.job.mileageOut !== null
      ? String(props.job.mileageOut)
      : props.job.mileageIn !== null
        ? String(props.job.mileageIn + 5)
        : "",
  );
  const [roadTestKm, setRoadTestKm] = useState(
    props.handover?.roadTestKm !== null && props.handover?.roadTestKm !== undefined
      ? String(props.handover.roadTestKm)
      : "5",
  );
  const [roadTestResult, setRoadTestResult] = useState(
    props.handover?.roadTestResult ?? "Passed — no abnormal noises or warning lights",
  );
  const [walkthroughDone, setWalkthroughDone] = useState(props.handover?.walkthroughDone ?? true);
  const [partsReturned, setPartsReturned] = useState(props.handover?.partsReturned ?? true);
  const [nextServiceKm, setNextServiceKm] = useState(
    props.handover?.nextServiceKm ? String(props.handover.nextServiceKm) : "",
  );
  const [nextServiceDate, setNextServiceDate] = useState(props.handover?.nextServiceDate ?? "");
  const [customerTypedName, setCustomerTypedName] = useState(props.customer?.name ?? "");

  function handleCheckIn(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const res = await checkInVehicleAction({
        jobId: props.job.id,
        mileageIn: Number(mileageIn),
        fuelLevel,
        bodyCondition,
        trackerPresent,
        spareWheel,
        dashboardWarnings,
        notes: arrivalNotes || undefined,
      });
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error ?? "Check-in failed." });
        return;
      }
      setFeedback({ type: "success", text: res.message ?? "Check-in saved." });
      router.refresh();
    });
  }

  async function handlePhotoUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFeedback(null);
    const form = e.currentTarget;
    const fileInput = form.elements.namedItem("photoFile") as HTMLInputElement | null;
    const file = fileInput?.files?.[0];
    if (!file) {
      setFeedback({ type: "error", text: "Choose a photo or printout file first." });
      return;
    }

    setPhotoUploading(true);
    try {
      const fd = new FormData();
      fd.set("jobId", props.job.id);
      fd.set("kind", photoKind);
      fd.set("file", file);
      const res = await fetch("/api/garage/photos", { method: "POST", body: fd });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setFeedback({ type: "error", text: json.error ?? "Upload failed." });
        return;
      }
      form.reset();
      setFeedback({ type: "success", text: "Workshop photo uploaded." });
      router.refresh();
    } catch {
      setFeedback({ type: "error", text: "Upload failed. Try again." });
    } finally {
      setPhotoUploading(false);
    }
  }

  function handleAddRecommendation(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const res = await addRecommendationAction({
        jobId: props.job.id,
        finding: recFinding,
        urgency: recUrgency as
          | "do_not_delay"
          | "within_1_month"
          | "with_the_above"
          | "three_to_four_months"
          | "monitor"
          | "no_action",
        reminderOn: recReminderOn || undefined,
      });
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error ?? "Failed to log recommendation." });
        return;
      }
      setRecFinding("");
      setRecReminderOn("");
      setFeedback({ type: "success", text: res.message ?? "Recommendation added." });
      router.refresh();
    });
  }

  function handleDeleteRec(id: string) {
    setFeedback(null);
    startTransition(async () => {
      const res = await deleteRecommendationAction(props.job.id, id);
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error ?? "Could not remove recommendation." });
        return;
      }
      router.refresh();
    });
  }

  function submitHandover(completeOnSite: boolean) {
    setFeedback(null);
    startTransition(async () => {
      const res = await recordHandoverAction({
        jobId: props.job.id,
        mileageOut: Number(mileageOut),
        roadTestKm: roadTestKm ? Number(roadTestKm) : null,
        roadTestResult,
        walkthroughDone,
        partsReturned,
        nextServiceKm: nextServiceKm ? Number(nextServiceKm) : null,
        nextServiceDate: nextServiceDate || undefined,
        completeOnSite,
        customerTypedName: completeOnSite ? customerTypedName : undefined,
      });
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error ?? "Could not record handover." });
        return;
      }
      setFeedback({ type: "success", text: res.message ?? "Handover recorded." });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {feedback ? (
        <Alert variant={feedback.type === "error" ? "error" : "success"}>{feedback.text}</Alert>
      ) : null}

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Vehicle & fault</CardDescription>
            <CardTitle className="text-base">
              {props.vehicle
                ? `${props.vehicle.regNo} — ${props.vehicle.makeModel}${props.vehicle.year ? ` (${props.vehicle.year})` : ""}`
                : "Vehicle record"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-muted-foreground">
            <p>Fault: {props.application.faultDescription ?? "See approved scope"}</p>
            <p>
              Mileage in: {props.job.mileageIn !== null ? `${props.job.mileageIn.toLocaleString()} km` : "Pending"}
              {props.job.mileageOut !== null
                ? ` | Out: ${props.job.mileageOut.toLocaleString()} km`
                : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Customer & branch</CardDescription>
            <CardTitle className="text-base">{props.customer?.name ?? "Customer"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-muted-foreground">
            {props.customer?.phoneNumber ? <p>Phone: {props.customer.phoneNumber}</p> : null}
            <p>Garage: {props.garage?.branch ?? props.garage?.name ?? "Assigned branch"}</p>
            <p>Application: {props.application.reference}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Job status & progress</CardDescription>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  props.job.status === "completed"
                    ? "success"
                    : props.job.status === "in_progress"
                      ? "accent"
                      : "brand"
                }
              >
                {props.job.status.replace("_", " ")}
              </Badge>
              <span className="text-xs font-medium text-foreground">
                {completedCount} / {props.lines.length} lines done
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-muted-foreground">
            <p>Opened: {props.job.openedAtFormatted}</p>
            {props.job.completedAtFormatted ? (
              <p>Completed: {props.job.completedAtFormatted}</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Navigation tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {(
          [
            { id: "checkin", label: "1. Check-in & arrival" },
            { id: "scope", label: `2. Repair scope (${completedCount}/${props.lines.length})` },
            { id: "photos", label: `3. Photos (${props.photos.length})` },
            { id: "recommendations", label: `4. Advisories (${props.recommendations.length})` },
            { id: "handover", label: "5. QA & handover" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium cursor-pointer ${
              activeTab === tab.id
                ? "bg-brand text-brand-foreground"
                : "bg-surface text-muted-foreground border border-border hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: Check-In */}
      {activeTab === "checkin" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vehicle check-in & arrival checks</CardTitle>
            <CardDescription>
              Record odometer reading and arrival condition when the vehicle enters the bay.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCheckIn} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="mileageIn">Mileage in (km)</Label>
                  <Input
                    id="mileageIn"
                    type="number"
                    min={0}
                    required
                    disabled={readOnly || isPending}
                    value={mileageIn}
                    onChange={(e) => setMileageIn(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="fuelLevel">Fuel level</Label>
                  <select
                    id="fuelLevel"
                    disabled={readOnly || isPending}
                    value={fuelLevel}
                    onChange={(e) => setFuelLevel(e.target.value)}
                    className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
                  >
                    <option value="Empty">Reserve / Empty</option>
                    <option value="Quarter">1/4 Tank</option>
                    <option value="Half">1/2 Tank</option>
                    <option value="Three-quarters">3/4 Tank</option>
                    <option value="Full">Full</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bodyCondition">Body condition</Label>
                  <Input
                    id="bodyCondition"
                    required
                    disabled={readOnly || isPending}
                    value={bodyCondition}
                    onChange={(e) => setBodyCondition(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-6 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={readOnly || isPending}
                    checked={trackerPresent}
                    onChange={(e) => setTrackerPresent(e.target.checked)}
                  />
                  <span>Tracker inspected / confirmed</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={readOnly || isPending}
                    checked={spareWheel}
                    onChange={(e) => setSpareWheel(e.target.checked)}
                  />
                  <span>Spare wheel & jack present</span>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="dashboardWarnings">Dashboard warning lights</Label>
                  <Input
                    id="dashboardWarnings"
                    disabled={readOnly || isPending}
                    value={dashboardWarnings}
                    onChange={(e) => setDashboardWarnings(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="arrivalNotes">Arrival notes</Label>
                  <Input
                    id="arrivalNotes"
                    disabled={readOnly || isPending}
                    placeholder="Optional arrival remarks"
                    value={arrivalNotes}
                    onChange={(e) => setArrivalNotes(e.target.value)}
                  />
                </div>
              </div>

              {!readOnly ? (
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Saving..." : "Save check-in & start repair"}
                </Button>
              ) : null}
            </form>
          </CardContent>
        </Card>
      ) : null}

      {/* Tab 2: Approved Scope Execution */}
      {activeTab === "scope" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Approved repair scope lines</CardTitle>
            <CardDescription>
              Only items approved and signed by the customer appear here. Record technician, part fitted, warranty, and mark each line complete.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {props.lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">No approved scope lines found on this job card.</p>
            ) : (
              props.lines.map((line) => (
                <LineEditorRow
                  key={line.id}
                  jobId={props.job.id}
                  line={line}
                  readOnly={readOnly}
                  onSaved={(msg) => setFeedback({ type: "success", text: msg })}
                />
              ))
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Tab 3: Workshop Photos */}
      {activeTab === "photos" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Workshop evidence photos</CardTitle>
            <CardDescription>
              Upload before/after photos, removed old parts, and alignment or test printouts.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!readOnly ? (
              <form
                onSubmit={handlePhotoUpload}
                className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-4 items-end"
              >
                <div className="space-y-1">
                  <Label htmlFor="photoKind">Category</Label>
                  <select
                    id="photoKind"
                    value={photoKind}
                    onChange={(e) => setPhotoKind(e.target.value)}
                    className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
                  >
                    {PHOTO_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="photoFile">Photo / printout (JPG, PNG, WebP, PDF)</Label>
                  <Input
                    id="photoFile"
                    name="photoFile"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    required
                  />
                </div>
                <Button type="submit" disabled={photoUploading}>
                  {photoUploading ? "Uploading..." : "Upload photo"}
                </Button>
              </form>
            ) : null}

            {props.photos.length === 0 ? (
              <p className="text-sm text-muted-foreground">No workshop photos uploaded yet.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {props.photos.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border p-3 text-xs"
                  >
                    <div>
                      <p className="font-semibold capitalize text-foreground">
                        {p.kind.replace("_", " ")}
                      </p>
                      <p className="text-muted-foreground">{p.createdAtFormatted}</p>
                    </div>
                    <a
                      href={`/api/garage/photos/${p.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-accent hover:underline"
                    >
                      View file
                    </a>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Tab 4: Advisory Recommendations */}
      {activeTab === "recommendations" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Advisory maintenance recommendations</CardTitle>
            <CardDescription>
              Log non-financed items noticed during repair for the customer&apos;s future service record.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!readOnly ? (
              <form onSubmit={handleAddRecommendation} className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-4 items-end">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="recFinding">Finding / recommendation</Label>
                  <Input
                    id="recFinding"
                    required
                    placeholder="e.g. Rear brake pads at 30%, replace at next service"
                    value={recFinding}
                    onChange={(e) => setRecFinding(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="recUrgency">Urgency</Label>
                  <select
                    id="recUrgency"
                    value={recUrgency}
                    onChange={(e) => setRecUrgency(e.target.value)}
                    className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
                  >
                    {URGENCY_OPTIONS.map((u) => (
                      <option key={u.value} value={u.value}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="recReminderOn">Reminder date</Label>
                  <Input
                    id="recReminderOn"
                    type="date"
                    value={recReminderOn}
                    onChange={(e) => setRecReminderOn(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-4">
                  <Button type="submit" size="sm" disabled={isPending}>
                    {isPending ? "Adding..." : "Add recommendation"}
                  </Button>
                </div>
              </form>
            ) : null}

            {props.recommendations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No advisory recommendations recorded.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {props.recommendations.map((rec) => (
                  <li
                    key={rec.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                  >
                    <div>
                      <p className="font-medium text-foreground">{rec.finding}</p>
                      <p className="text-xs text-muted-foreground">
                        Urgency: {rec.urgency.replaceAll("_", " ")}
                        {rec.reminderOn ? ` | Reminder: ${rec.reminderOn}` : ""}
                      </p>
                    </div>
                    {!readOnly ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={isPending}
                        onClick={() => handleDeleteRec(rec.id)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* Tab 5: QA & Handover */}
      {activeTab === "handover" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quality assurance & vehicle handover</CardTitle>
            <CardDescription>
              Complete QA checks after all approved scope lines are done. Handover completion issues the certificate and transitions the application to REPAYING.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!allLinesComplete && !readOnly ? (
              <Alert variant="warning">
                Complete all {props.lines.length} approved repair scope lines ({completedCount} completed) before recording handover.
              </Alert>
            ) : null}

            {props.handover?.handedOverAtFormatted ? (
              <Alert variant="success">
                Vehicle handed over on {props.handover.handedOverAtFormatted}. Application is now in{" "}
                <strong>{props.application.status}</strong>.
              </Alert>
            ) : props.handover ? (
              <Alert variant="info">
                QA sign-off saved. The customer can confirm collection in their account, or you can complete handover on-site below.
              </Alert>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="mileageOut">Mileage out (km)</Label>
                <Input
                  id="mileageOut"
                  type="number"
                  min={1}
                  required
                  disabled={readOnly || isPending}
                  value={mileageOut}
                  onChange={(e) => setMileageOut(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="roadTestKm">Road test distance (km)</Label>
                <Input
                  id="roadTestKm"
                  type="number"
                  min={0}
                  disabled={readOnly || isPending}
                  value={roadTestKm}
                  onChange={(e) => setRoadTestKm(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="roadTestResult">Road test result</Label>
                <Input
                  id="roadTestResult"
                  required
                  disabled={readOnly || isPending}
                  value={roadTestResult}
                  onChange={(e) => setRoadTestResult(e.target.value)}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="nextServiceKm">Next service at (km)</Label>
                <Input
                  id="nextServiceKm"
                  type="number"
                  min={0}
                  disabled={readOnly || isPending}
                  placeholder="Optional"
                  value={nextServiceKm}
                  onChange={(e) => setNextServiceKm(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nextServiceDate">Next service date</Label>
                <Input
                  id="nextServiceDate"
                  type="date"
                  disabled={readOnly || isPending}
                  value={nextServiceDate}
                  onChange={(e) => setNextServiceDate(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-6 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={readOnly || isPending}
                  checked={walkthroughDone}
                  onChange={(e) => setWalkthroughDone(e.target.checked)}
                />
                <span>Customer walkthrough completed</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={readOnly || isPending}
                  checked={partsReturned}
                  onChange={(e) => setPartsReturned(e.target.checked)}
                />
                <span>Old replaced parts shown / returned</span>
              </label>
            </div>

            {!readOnly ? (
              <div className="space-y-4 border-t border-border pt-4">
                <div className="space-y-1.5 max-w-md">
                  <Label htmlFor="customerTypedName">
                    Customer full name (for on-site handover confirmation)
                  </Label>
                  <Input
                    id="customerTypedName"
                    disabled={isPending}
                    value={customerTypedName}
                    onChange={(e) => setCustomerTypedName(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isPending || !allLinesComplete}
                    onClick={() => submitHandover(false)}
                  >
                    {isPending ? "Saving..." : "Save QA & request customer sign-off"}
                  </Button>
                  <Button
                    type="button"
                    disabled={isPending || !allLinesComplete || customerTypedName.trim().length < 2}
                    onClick={() => submitHandover(true)}
                  >
                    {isPending ? "Completing..." : "Complete handover on-site"}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
