"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { signInAction } from "../actions";

export function SignInForm({
  nextPath,
  resetCompleted,
  ipBlocked,
}: {
  nextPath: string;
  resetCompleted: boolean;
  ipBlocked: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(
    ipBlocked ? "Access from this IP address is not permitted." : null,
  );
  const [requiresCaptcha, setRequiresCaptcha] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await signInAction(formData);
      if (!result.ok) {
        setError(result.error ?? "Email, phone or password is incorrect.");
        if (result.requiresCaptcha) setRequiresCaptcha(true);
        return;
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

      {resetCompleted ? (
        <Alert variant="success">
          Your password has been updated. Sign in with your new password.
        </Alert>
      ) : null}

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="space-y-1.5">
        <Label htmlFor="identifier">Email or phone number</Label>
        <Input
          id="identifier"
          name="identifier"
          type="text"
          autoComplete="username"
          placeholder="you@example.com or 0712 345 678"
          required
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link href="/forgot-password" className="text-xs font-medium text-accent hover:underline">
            Forgot password?
          </Link>
        </div>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="keepSignedIn"
          name="keepSignedIn"
          type="checkbox"
          defaultChecked
          className="h-4 w-4 rounded border-border-strong accent-brand"
        />
        <label htmlFor="keepSignedIn" className="text-sm text-muted-foreground">
          Keep me signed in
        </label>
      </div>

      {requiresCaptcha ? (
        <Alert variant="warning">
          Additional security check active after repeated failed attempts.
        </Alert>
      ) : null}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Signing in..." : "Sign in"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        New to Ask AutoParts?{" "}
        <Link
          href={`/sign-up?next=${encodeURIComponent(nextPath)}`}
          className="font-medium text-foreground underline"
        >
          Create account
        </Link>
      </p>
    </form>
  );
}
