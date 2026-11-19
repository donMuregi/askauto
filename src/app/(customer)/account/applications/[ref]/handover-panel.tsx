"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmHandover } from "@/app/(customer)/apply/actions";

interface HandoverPanelProps {
  applicationId: string;
  applicationStatus: string;
  customerName: string;
  job: {
    jobNo: number;
    status: string;
    mileageIn: number | null;
    mileageOut: number | null;
  };
  lines: Array<{
    id: string;
    serviceCode: string;
    description: string;
    partFitted: string | null;
    grade: string | null;
    warrantyToDate: string | null;
    warrantyToKm: number | null;
    completedAtFormatted: string | null;
  }>;
  recommendations: Array<{
    id: string;
    finding: string;
    urgency: string;
    reminderOn: string | null;
  }>;
  photos: Array<{
    id: string;
    kind: string;
  }>;
  handover: {
    roadTestKm: number | null;
    roadTestResult: string | null;
    walkthroughDone: boolean;
    partsReturned: boolean;
    nextServiceKm: number | null;
    nextServiceDate: string | null;
    handedOverAtFormatted: string | null;
  } | null;
}

export function HandoverPanel({
  applicationId,
  applicationStatus,
  customerName,
  job,
  lines,
  recommendations,
  photos,
  handover,
}: HandoverPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [typedName, setTypedName] = useState(customerName);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const completedCount = lines.filter((l) => Boolean(l.completedAtFormatted)).length;
  const canConfirm =
    applicationStatus === "REPAIR_IN_PROGRESS" &&
    job.status !== "completed" &&
    Boolean(handover && !handover.handedOverAtFormatted);

  function handleConfirm() {
    setFeedback(null);
    startTransition(async () => {
      const res = await confirmHandover({ applicationId, typedName });
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error ?? "Could not confirm handover." });
        return;
      }
      setFeedback({ type: "success", text: res.message ?? "Vehicle collection confirmed." });
      router.refresh();
    });
  }

  return (
    <Card className={canConfirm ? "border-border-strong" : undefined}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Garage repair progress (Job #{job.jobNo})</CardTitle>
            <CardDescription>
              {completedCount} of {lines.length} approved repair item(s) completed.
            </CardDescription>
          </div>
          <Badge variant={job.status === "completed" ? "success" : "accent"}>
            {job.status === "completed"
              ? "Handed over"
              : canConfirm
                ? "Ready for collection"
                : job.status.replace("_", " ")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {feedback ? (
          <Alert variant={feedback.type === "error" ? "error" : "success"}>{feedback.text}</Alert>
        ) : null}

        {lines.length > 0 ? (
          <ul className="space-y-2">
            {lines.map((line) => (
              <li
                key={line.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs"
              >
                <div>
                  <p className="font-medium text-foreground">{line.description}</p>
                  <p className="text-muted-foreground">
                    {line.partFitted ? `Part: ${line.partFitted}` : "Pending fitment"}
                    {line.grade ? ` (${line.grade})` : ""}
                    {line.warrantyToDate ? ` | Warranty until ${line.warrantyToDate}` : ""}
                    {line.warrantyToKm ? ` / ${line.warrantyToKm.toLocaleString()} km` : ""}
                  </p>
                </div>
                <Badge variant={line.completedAtFormatted ? "success" : "neutral"}>
                  {line.completedAtFormatted ? "Done" : "In progress"}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}

        {photos.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">Workshop photos</p>
            <div className="flex flex-wrap gap-2">
              {photos.map((p) => (
                <a
                  key={p.id}
                  href={`/api/garage/photos/${p.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-accent hover:bg-surface-muted"
                >
                  View {p.kind.replace("_", " ")}
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {recommendations.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-muted-foreground">
              Garage maintenance advisories
            </p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {recommendations.map((rec) => (
                <li key={rec.id}>
                  <span className="font-medium text-foreground">{rec.finding}</span> (
                  {rec.urgency.replaceAll("_", " ")}
                  {rec.reminderOn ? `, reminder ${rec.reminderOn}` : ""})
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {handover ? (
          <div className="rounded-md border border-border bg-surface-muted p-3 text-xs space-y-1">
            <p className="font-semibold text-foreground">Quality assurance & handover summary</p>
            {job.mileageOut !== null ? (
              <p>
                Mileage out: {job.mileageOut.toLocaleString()} km
                {handover.roadTestKm !== null ? ` | Road test: ${handover.roadTestKm} km` : ""}
              </p>
            ) : null}
            {handover.roadTestResult ? <p>Road test: {handover.roadTestResult}</p> : null}
            <p>
              Walkthrough: {handover.walkthroughDone ? "Completed" : "Pending"} | Old parts
              returned: {handover.partsReturned ? "Yes" : "No"}
            </p>
            {handover.nextServiceDate || handover.nextServiceKm ? (
              <p>
                Next service: {handover.nextServiceDate ?? "—"}
                {handover.nextServiceKm ? ` (${handover.nextServiceKm.toLocaleString()} km)` : ""}
              </p>
            ) : null}
            {handover.handedOverAtFormatted ? (
              <p className="font-medium text-success">
                Vehicle collected on {handover.handedOverAtFormatted}.
              </p>
            ) : null}
          </div>
        ) : null}

        {canConfirm ? (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="space-y-1.5 max-w-md">
              <Label htmlFor="handoverTypedName">
                Type your full name to confirm vehicle collection
              </Label>
              <Input
                id="handoverTypedName"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
              />
            </div>
            <Button
              type="button"
              disabled={isPending || typedName.trim().length < 2}
              onClick={handleConfirm}
            >
              {isPending ? "Confirming..." : "Confirm vehicle collection & sign"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
