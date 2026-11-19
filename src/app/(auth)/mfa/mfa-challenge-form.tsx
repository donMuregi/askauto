"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { verifyMfaChallengeAction } from "../actions";

export function MfaChallengeForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRecoveryCode, setIsRecoveryCode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const res = await verifyMfaChallengeAction(formData);
      if (!res.ok) {
        setError(res.error ?? "Invalid verification code.");
        return;
      }
      if (res.redirectTo) {
        router.push(res.redirectTo);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input type="hidden" name="next" value={nextPath} />
      <input type="hidden" name="isRecoveryCode" value={String(isRecoveryCode)} />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="space-y-1.5">
        <Label htmlFor="code">
          {isRecoveryCode ? "One-time recovery code" : "6-digit authenticator code"}
        </Label>
        <Input
          id="code"
          name="code"
          type="text"
          inputMode={isRecoveryCode ? "text" : "numeric"}
          autoComplete="one-time-code"
          required
        />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Verifying..." : "Verify"}
      </Button>

      <div className="text-center">
        <button
          type="button"
          onClick={() => setIsRecoveryCode((prev) => !prev)}
          className="text-xs font-medium text-accent hover:underline cursor-pointer"
        >
          {isRecoveryCode ? "Use authenticator app code" : "Use a recovery code instead"}
        </button>
      </div>
    </form>
  );
}
