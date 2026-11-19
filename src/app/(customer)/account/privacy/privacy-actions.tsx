"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestAccountDeletion, requestDataExport } from "../actions";

export function PrivacyActions() {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  function handleExport() {
    setStatus(null);
    startTransition(async () => {
      const res = await requestDataExport();
      setStatus({
        kind: res.ok ? "success" : "error",
        text: res.ok ? (res.message ?? "Export requested.") : (res.error ?? "Request failed."),
      });
    });
  }

  function handleDelete(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const res = await requestAccountDeletion(fd);
      setStatus({
        kind: res.ok ? "success" : "error",
        text: res.ok ? (res.message ?? "Deletion requested.") : (res.error ?? "Request failed."),
      });
    });
  }

  return (
    <div className="space-y-6">
      {status ? (
        <Alert variant={status.kind === "error" ? "error" : "success"}>{status.text}</Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Download my data</CardTitle>
          <CardDescription>
            Request a copy of your personal data held on the platform. Fulfilled within 30 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={handleExport} disabled={isPending}>
            Request data export
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Delete my account</CardTitle>
          <CardDescription>
            Available only when you have no active applications. On approval, your personal profile
            fields are anonymised and uploaded identity files are deleted. Application, fee payment,
            and audit records required for lender and legal retention are retained in pseudonymised
            form.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleDelete} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reason">Reason (optional)</Label>
              <Input id="reason" name="reason" type="text" maxLength={250} />
            </div>
            <Button type="submit" variant="destructive" disabled={isPending}>
              Request account deletion
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
