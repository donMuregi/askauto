"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resendEmailVerificationAction,
  sendPhoneOtpAction,
  verifyPhoneOtpAction,
} from "../actions";

interface VerifyChecklistProps {
  email: string;
  emailVerified: boolean;
  phoneNumber: string | null;
  phoneNumberVerified: boolean;
  nextPath: string;
}

export function VerifyChecklist({
  email,
  emailVerified,
  phoneNumber,
  phoneNumberVerified,
  nextPath,
}: VerifyChecklistProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setTimeout(() => setCooldownSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldownSeconds]);

  function handleResendEmail() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await resendEmailVerificationAction(nextPath);
      if (!res.ok) setError(res.error ?? "Could not send verification email.");
      else setMessage(res.message ?? "Verification email sent.");
    });
  }

  function handleResendOtp() {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await sendPhoneOtpAction();
      if (!res.ok) {
        setError(res.error ?? "Could not send SMS code.");
      } else {
        setMessage(res.message ?? "Verification code sent.");
        setCooldownSeconds(60);
      }
    });
  }

  function handleVerifyOtp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const res = await verifyPhoneOtpAction(formData);
      if (!res.ok) {
        setError(res.error ?? "Invalid verification code.");
        return;
      }
      if (res.redirectTo) {
        router.push(res.redirectTo);
      } else {
        setMessage(res.message ?? "Phone verified.");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      {error ? <Alert variant="error">{error}</Alert> : null}
      {message ? <Alert variant="success">{message}</Alert> : null}

      <div className="rounded-md border border-border p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Verify by phone (SMS code)</p>
            <p className="text-xs text-muted-foreground">{phoneNumber ?? "Not set"}</p>
          </div>
          <Badge variant={phoneNumberVerified ? "success" : "brand"}>
            {phoneNumberVerified ? "Verified" : "Pending"}
          </Badge>
        </div>
        {!phoneNumberVerified ? (
          <form onSubmit={handleVerifyOtp} className="space-y-3">
            <input type="hidden" name="next" value={nextPath} />
            <div className="space-y-1.5">
              <Label htmlFor="code">6-digit SMS code</Label>
              <Input
                id="code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="\d{6}"
                placeholder="123456"
                required
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={isPending}>
                Verify phone
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleResendOtp}
                disabled={isPending || cooldownSeconds > 0}
              >
                {cooldownSeconds > 0 ? `Resend in ${cooldownSeconds}s` : "Resend SMS code"}
              </Button>
            </div>
          </form>
        ) : null}
      </div>

      <p className="text-center text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Or
      </p>

      <div className="rounded-md border border-border p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Verify by email link</p>
            <p className="text-xs text-muted-foreground">{email}</p>
          </div>
          <Badge variant={emailVerified ? "success" : "brand"}>
            {emailVerified ? "Verified" : "Pending"}
          </Badge>
        </div>
        {!emailVerified ? (
          <Button
            variant="outline"
            size="sm"
            onClick={handleResendEmail}
            disabled={isPending}
          >
            Resend verification email
          </Button>
        ) : null}
      </div>
    </div>
  );
}
