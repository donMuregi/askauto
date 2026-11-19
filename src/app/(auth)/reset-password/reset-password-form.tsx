"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PasswordStrengthMeter } from "@/components/forms/password-strength";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { resetPasswordEmailAction, resetPasswordPhoneAction } from "../actions";

export function ResetPasswordForm({
  token,
  smsMode,
  initialPhone,
}: {
  token?: string;
  smsMode: boolean;
  initialPhone?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const res = smsMode
        ? await resetPasswordPhoneAction(formData)
        : await resetPasswordEmailAction(formData);
      if (!res.ok) {
        setError(res.error ?? "Reset link or code is invalid or expired.");
        return;
      }
      if (res.redirectTo) {
        router.push(res.redirectTo);
      }
    });
  }

  if (!smsMode && !token) {
    return (
      <div className="space-y-4">
        <Alert variant="error">
          This reset link is invalid or expired. Request a new password reset.
        </Alert>
        <Link
          href="/forgot-password"
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-brand-foreground hover:bg-brand-hover"
        >
          Request a new reset link
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {!smsMode && token ? <input type="hidden" name="token" value={token} /> : null}

      {error ? (
        <Alert variant="error">
          {error}{" "}
          <Link href="/forgot-password" className="underline font-medium">
            Request a new one
          </Link>
          .
        </Alert>
      ) : null}

      {smsMode ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone number</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              defaultValue={initialPhone ?? ""}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="code">6-digit SMS code</Label>
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
        </>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="password">New password (at least 10 characters)</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          minLength={10}
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <PasswordStrengthMeter password={password} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Confirm new password</Label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
        />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Updating password..." : "Update password"}
      </Button>
    </form>
  );
}
