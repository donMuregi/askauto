"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction } from "../actions";

export function ForgotPasswordForm() {
  const [isPending, startTransition] = useTransition();
  const [channel, setChannel] = useState<"auto" | "sms">("auto");
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showSmsResetLink, setShowSmsResetLink] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const res = await forgotPasswordAction(formData);
      if (!res.ok) {
        setError(res.error ?? "Could not process request.");
        return;
      }
      setMessage(
        res.message ?? "If an account exists for that email or phone, we have sent instructions.",
      );
      setShowSmsResetLink(Boolean(res.smsSentFlow));
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="channel" value={channel} />
      <input type="hidden" name="turnstileToken" value="fake-pass" />

      {error ? <Alert variant="error">{error}</Alert> : null}
      {message ? <Alert variant="success">{message}</Alert> : null}

      <div className="space-y-1.5">
        <Label htmlFor="identifier">
          {channel === "sms" ? "Kenyan phone number" : "Email or phone number"}
        </Label>
        <Input
          id="identifier"
          name="identifier"
          type={channel === "sms" ? "tel" : "text"}
          autoComplete={channel === "sms" ? "tel" : "username"}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder={channel === "sms" ? "0712 345 678" : "you@example.com or 0712 345 678"}
          required
        />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending
          ? "Sending..."
          : channel === "sms"
            ? "Send SMS reset code"
            : "Send reset instructions"}
      </Button>

      <div className="text-center">
        <button
          type="button"
          onClick={() => setChannel((prev) => (prev === "sms" ? "auto" : "sms"))}
          className="text-xs font-medium text-accent hover:underline cursor-pointer"
        >
          {channel === "sms"
            ? "Use email reset link instead"
            : "Send a code to my phone instead"}
        </button>
      </div>

      {showSmsResetLink ? (
        <div className="pt-2 text-center">
          <Link
            href={`/reset-password?mode=sms&phone=${encodeURIComponent(identifier)}`}
            className="text-sm font-medium text-foreground underline"
          >
            Enter your SMS code and choose a new password
          </Link>
        </div>
      ) : null}

      <p className="text-center text-sm text-muted-foreground">
        <Link href="/sign-in" className="font-medium text-foreground underline">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
