"use client";

import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  changeEmail,
  changePhone,
  confirmPhoneChange,
  updateProfile,
} from "../actions";

interface ProfileFormsProps {
  fullName: string;
  email: string;
  phoneNumber: string | null;
  maskedNationalId: string | null;
}

export function ProfileForms({
  fullName,
  email,
  phoneNumber,
  maskedNationalId,
}: ProfileFormsProps) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [awaitingPhoneOtp, setAwaitingPhoneOtp] = useState(false);

  function submitForm(
    event: React.FormEvent<HTMLFormElement>,
    action: (fd: FormData) => Promise<{ ok: boolean; message?: string; error?: string }>,
    onSuccess?: () => void,
  ) {
    event.preventDefault();
    setStatus(null);
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const res = await action(fd);
      if (!res.ok) {
        setStatus({ kind: "error", text: res.error ?? "Update failed." });
        return;
      }
      setStatus({ kind: "success", text: res.message ?? "Saved." });
      onSuccess?.();
    });
  }

  return (
    <div className="space-y-6">
      {status ? (
        <Alert variant={status.kind === "error" ? "error" : "success"}>{status.text}</Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Personal details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => submitForm(e, updateProfile)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" name="fullName" defaultValue={fullName} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="locale">Language</Label>
              <select
                id="locale"
                name="locale"
                defaultValue="en"
                className="flex min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm"
              >
                <option value="en">English</option>
              </select>
            </div>
            {maskedNationalId ? (
              <div className="space-y-1">
                <Label>National ID on file</Label>
                <p className="text-sm font-mono text-muted-foreground">{maskedNationalId}</p>
              </div>
            ) : null}
            <Button type="submit" disabled={isPending}>
              Save profile
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change email address</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">Current email: {email}</p>
          <form onSubmit={(e) => submitForm(e, changeEmail)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="newEmail">New email address</Label>
              <Input id="newEmail" name="newEmail" type="email" autoComplete="email" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emailCurrentPassword">Current password</Label>
              <PasswordInput
                id="emailCurrentPassword"
                name="currentPassword"
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" variant="outline" disabled={isPending}>
              Send verification link
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change phone number</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Current phone: {phoneNumber ?? "Not set"}
          </p>
          <form
            onSubmit={(e) => submitForm(e, changePhone, () => setAwaitingPhoneOtp(true))}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="newPhone">New Kenyan mobile number</Label>
              <Input
                id="newPhone"
                name="newPhone"
                type="tel"
                autoComplete="tel"
                placeholder="0712 345 678"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phoneCurrentPassword">Current password</Label>
              <PasswordInput
                id="phoneCurrentPassword"
                name="currentPassword"
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" variant="outline" disabled={isPending}>
              Send OTP to new number
            </Button>
          </form>

          {awaitingPhoneOtp ? (
            <form
              onSubmit={(e) => submitForm(e, confirmPhoneChange, () => setAwaitingPhoneOtp(false))}
              className="space-y-3 border-t border-border pt-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="phoneChangeCode">6-digit SMS code</Label>
                <Input
                  id="phoneChangeCode"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                />
              </div>
              <Button type="submit" disabled={isPending}>
                Confirm new phone number
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
