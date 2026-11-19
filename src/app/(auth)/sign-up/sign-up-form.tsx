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
import { signUpCustomerAction } from "../actions";

export function SignUpForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setSuccessMessage(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await signUpCustomerAction(formData);
      if (!result.ok) {
        setError(result.error ?? "Check your details and try again.");
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        return;
      }
      if (result.message) {
        setSuccessMessage(result.message);
      }
      if (result.redirectTo) {
        router.push(result.redirectTo);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={nextPath} />
      <input type="hidden" name="turnstileToken" value="fake-pass" />

      {error ? <Alert variant="error">{error}</Alert> : null}
      {successMessage ? <Alert variant="success">{successMessage}</Alert> : null}

      <div className="space-y-1.5">
        <Label htmlFor="fullName">Full name (as on national ID)</Label>
        <Input
          id="fullName"
          name="fullName"
          type="text"
          autoComplete="name"
          required
          minLength={2}
          maxLength={80}
          aria-invalid={Boolean(fieldErrors.fullName)}
        />
        {fieldErrors.fullName ? (
          <p className="text-xs text-destructive" aria-live="polite">
            {fieldErrors.fullName}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email address</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={Boolean(fieldErrors.email)}
        />
        {fieldErrors.email ? (
          <p className="text-xs text-destructive" aria-live="polite">
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="phone">Kenyan mobile number</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          placeholder="0712 345 678"
          required
          aria-invalid={Boolean(fieldErrors.phone)}
        />
        {fieldErrors.phone ? (
          <p className="text-xs text-destructive" aria-live="polite">
            {fieldErrors.phone}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password (at least 10 characters)</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(fieldErrors.password)}
        />
        <PasswordStrengthMeter password={password} />
        {fieldErrors.password ? (
          <p className="text-xs text-destructive" aria-live="polite">
            {fieldErrors.password}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
          aria-invalid={Boolean(fieldErrors.confirmPassword)}
        />
        {fieldErrors.confirmPassword ? (
          <p className="text-xs text-destructive" aria-live="polite">
            {fieldErrors.confirmPassword}
          </p>
        ) : null}
      </div>

      <div className="flex items-start gap-2.5 pt-1">
        <input
          id="acceptTerms"
          name="acceptTerms"
          type="checkbox"
          required
          className="mt-1 h-4 w-4 rounded border-border-strong accent-brand"
        />
        <label htmlFor="acceptTerms" className="text-xs text-muted-foreground leading-relaxed">
          I accept the{" "}
          <Link href="/legal/terms" className="font-medium text-foreground underline">
            Terms of Use
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy" className="font-medium text-foreground underline">
            Privacy Notice
          </Link>
          .
        </label>
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Creating account..." : "Create account"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={`/sign-in?next=${encodeURIComponent(nextPath)}`}
          className="font-medium text-foreground underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
