"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PasswordStrengthMeter } from "@/components/forms/password-strength";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { acceptInviteAction } from "../../actions";

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const res = await acceptInviteAction(formData);
      if (!res.ok) {
        setError(res.error ?? "Could not accept invitation.");
        return;
      }
      if (res.redirectTo) {
        router.push(res.redirectTo);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="token" value={token} />
      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="space-y-1.5">
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" name="fullName" type="text" autoComplete="name" required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password (at least 10 characters)</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <PasswordStrengthMeter password={password} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          autoComplete="new-password"
          required
        />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "Setting up account..." : "Activate account"}
      </Button>
    </form>
  );
}
