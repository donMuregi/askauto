"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { startTotpEnrollmentAction, verifyMfaChallengeAction } from "../../actions";

export function MfaSetupForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [totpURI, setTotpURI] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  function extractSecret(uri: string): string {
    try {
      const parsed = new URL(uri);
      return parsed.searchParams.get("secret") ?? uri;
    } catch {
      return uri;
    }
  }

  function handleStart(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await startTotpEnrollmentAction(password);
      if (!res.ok || !res.totpURI) {
        setError(res.error ?? "Could not start setup. Check your password.");
        return;
      }
      setTotpURI(res.totpURI);
      setBackupCodes(res.backupCodes ?? []);
    });
  }

  function handleConfirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const res = await verifyMfaChallengeAction(formData);
      if (!res.ok) {
        setError(res.error ?? "Invalid authenticator code.");
        return;
      }
      if (res.redirectTo) {
        router.push(res.redirectTo);
      }
    });
  }

  if (!totpURI) {
    return (
      <form onSubmit={handleStart} className="space-y-4">
        {error ? <Alert variant="error">{error}</Alert> : null}
        <div className="space-y-1.5">
          <Label htmlFor="password">Confirm your password</Label>
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Generating key..." : "Generate authenticator key"}
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="space-y-2 rounded-md border border-border bg-surface-muted p-4 text-xs">
        <p className="font-semibold text-foreground">Manual setup key</p>
        <p className="break-all font-mono text-sm">{extractSecret(totpURI)}</p>
        <p className="text-muted-foreground break-all">URI: {totpURI}</p>
      </div>

      {backupCodes.length > 0 ? (
        <div className="space-y-2 rounded-md border border-brand/40 bg-brand-soft p-4">
          <p className="text-xs font-semibold text-foreground">
            One-time recovery codes (shown once; save them now)
          </p>
          <div className="grid grid-cols-2 gap-1 font-mono text-xs">
            {backupCodes.map((code) => (
              <span key={code}>{code}</span>
            ))}
          </div>
        </div>
      ) : null}

      <form onSubmit={handleConfirm} className="space-y-4">
        <input type="hidden" name="next" value={nextPath} />
        <input type="hidden" name="isRecoveryCode" value="false" />
        <div className="space-y-1.5">
          <Label htmlFor="code">6-digit authenticator code</Label>
          <Input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Confirming..." : "Confirm and continue"}
        </Button>
      </form>
    </div>
  );
}
