"use client";

import { Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DOC_TYPE_LABELS } from "@/server/domain/review/constants";
import { submitDocuments } from "../../../apply/actions";

export interface ChecklistDocItem {
  docType: string;
  required: boolean;
  uploadedBy: "customer" | "ops";
  upload: {
    id: string;
    status: string;
    mime: string;
    sizeBytes: number;
    hasPassword: boolean;
  } | null;
  latestReview: {
    decision: string;
    reasonCode: string | null;
    note: string | null;
  } | null;
}

interface DocumentsUploadPanelProps {
  applicationId: string;
  applicationStatus: string;
  checklist: ChecklistDocItem[];
}

function uploadBadge(status: string | undefined): {
  label: string;
  variant: "neutral" | "brand" | "success" | "destructive";
} {
  switch (status) {
    case "approved":
      return { label: "Approved", variant: "success" };
    case "rejected":
      return { label: "Rejected — re-upload", variant: "destructive" };
    case "uploaded":
      return { label: "Uploaded", variant: "brand" };
    default:
      return { label: "Missing", variant: "neutral" };
  }
}

export function DocumentsUploadPanel({
  applicationId,
  applicationStatus,
  checklist,
}: DocumentsUploadPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [mpesaPassword, setMpesaPassword] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(
    null,
  );

  const customerItems = checklist.filter((c) => c.uploadedBy === "customer");
  const canUpload = applicationStatus === "REPAIR_APPROVED";
  const allRequiredUploaded = customerItems
    .filter((c) => c.required)
    .every((c) => c.upload && (c.upload.status === "uploaded" || c.upload.status === "approved"));

  async function handleFileSelect(docType: string, file: File | null) {
    if (!file) return;
    setFeedback(null);
    setUploadingType(docType);

    try {
      const fd = new FormData();
      fd.set("applicationId", applicationId);
      fd.set("docType", docType);
      fd.set("file", file);
      if (docType === "mpesa_statement" && mpesaPassword.trim()) {
        fd.set("filePassword", mpesaPassword.trim());
      }

      const res = await fetch("/api/uploads/direct", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setFeedback({ kind: "error", text: json.error ?? "Upload failed. Try again." });
        return;
      }

      setFeedback({
        kind: "success",
        text: `${DOC_TYPE_LABELS[docType] ?? docType} uploaded.`,
      });
      router.refresh();
    } catch {
      setFeedback({ kind: "error", text: "Upload failed. Check your connection and try again." });
    } finally {
      setUploadingType(null);
    }
  }

  function handleSubmitAll() {
    setFeedback(null);
    startTransition(async () => {
      const res = await submitDocuments(applicationId);
      if (!res.ok) {
        setFeedback({ kind: "error", text: res.error ?? "Could not submit documents." });
        return;
      }
      setFeedback({ kind: "success", text: res.message ?? "Documents submitted for review." });
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Required documents</CardTitle>
        <CardDescription>
          {canUpload
            ? "Upload each required document below (JPEG, PNG, WebP, or PDF up to 10 MB). You can save and return anytime."
            : "Your uploaded documents and their review status."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {feedback ? (
          <Alert variant={feedback.kind === "error" ? "error" : "success"}>{feedback.text}</Alert>
        ) : null}

        <div className="space-y-3">
          {customerItems.map((item) => {
            const badge = uploadBadge(item.upload?.status);
            const isUploading = uploadingType === item.docType;

            return (
              <div
                key={item.docType}
                className="flex flex-col gap-3 rounded-md border border-border p-3.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {DOC_TYPE_LABELS[item.docType] ?? item.docType}
                    </span>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                  {item.upload?.status === "rejected" && item.latestReview ? (
                    <p className="text-xs text-destructive">
                      Rejected: {item.latestReview.reasonCode ?? ""}{" "}
                      {item.latestReview.note ? `— ${item.latestReview.note}` : ""}
                    </p>
                  ) : null}
                  {item.upload ? (
                    <a
                      href={`/api/files/${item.upload.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-xs font-medium text-accent hover:underline"
                    >
                      View uploaded file ({Math.max(1, Math.round(item.upload.sizeBytes / 1024))} KB)
                    </a>
                  ) : null}
                  {canUpload && item.docType === "mpesa_statement" ? (
                    <div className="pt-1 max-w-xs">
                      <Input
                        type="password"
                        value={mpesaPassword}
                        onChange={(e) => setMpesaPassword(e.target.value)}
                        placeholder="PDF password (optional)"
                        aria-label="M-Pesa PDF password"
                        className="min-h-9 text-xs"
                      />
                    </div>
                  ) : null}
                </div>

                {canUpload && item.upload?.status !== "approved" ? (
                  <label className="inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-2 rounded-md border border-border-strong bg-surface px-3 text-xs font-medium text-foreground hover:bg-surface-muted">
                    <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {isUploading
                        ? "Uploading..."
                        : item.upload
                          ? "Replace file"
                          : "Upload file"}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      disabled={isUploading}
                      onChange={(e) => void handleFileSelect(item.docType, e.target.files?.[0] ?? null)}
                      className="sr-only"
                    />
                  </label>
                ) : null}
              </div>
            );
          })}
        </div>

        {canUpload ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              {allRequiredUploaded
                ? "All required documents uploaded. Submit for Ask AutoParts review."
                : "Upload all missing documents to enable submission."}
            </p>
            <Button
              onClick={handleSubmitAll}
              disabled={isPending || !allRequiredUploaded}
            >
              {isPending ? "Submitting..." : "Submit documents for review"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
