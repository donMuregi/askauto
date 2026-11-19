"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelApplication } from "../../../apply/actions";

export function CancelApplicationForm({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const fd = new FormData(event.currentTarget);

    startTransition(async () => {
      const res = await cancelApplication(fd);
      if (!res.ok) {
        setError(res.error ?? "Could not cancel application.");
        return;
      }
      if (res.redirectTo) {
        router.push(res.redirectTo);
      }
    });
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Cancel application
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-md border border-border p-4">
      <input type="hidden" name="applicationId" value={applicationId} />
      {error ? <Alert variant="error">{error}</Alert> : null}
      <div className="space-y-1.5">
        <Label htmlFor="cancelReason">Reason for cancellation</Label>
        <Input id="cancelReason" name="reason" type="text" required minLength={3} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={isPending}>
          Confirm cancellation
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
          Keep application
        </Button>
      </div>
    </form>
  );
}
