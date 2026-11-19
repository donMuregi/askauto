"use client";

import { useState, useTransition } from "react";
import { signOutAction } from "@/app/(auth)/actions";
import { PasswordStrengthMeter } from "@/components/forms/password-strength";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { changePassword, revokeOtherSessions, revokeSession } from "../actions";

interface SessionItem {
  id: string;
  ipAddress: string;
  userAgent: string;
  lastActiveFormatted: string;
  isCurrent: boolean;
}

export function SecurityForms({ sessions }: { sessions: SessionItem[] }) {
  const [isPending, startTransition] = useTransition();
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  function handleChangePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const res = await changePassword(fd);
      setStatus({
        kind: res.ok ? "success" : "error",
        text: res.ok ? (res.message ?? "Password updated.") : (res.error ?? "Update failed."),
      });
      if (res.ok) {
        setNewPassword("");
        event.currentTarget.reset();
      }
    });
  }

  function handleRevoke(sessionId: string) {
    setStatus(null);
    startTransition(async () => {
      const res = await revokeSession(sessionId);
      setStatus({
        kind: res.ok ? "success" : "error",
        text: res.ok ? (res.message ?? "Session revoked.") : (res.error ?? "Failed to revoke."),
      });
    });
  }

  function handleRevokeOthers() {
    setStatus(null);
    startTransition(async () => {
      const res = await revokeOtherSessions();
      setStatus({
        kind: res.ok ? "success" : "error",
        text: res.ok ? (res.message ?? "Signed out of other devices.") : (res.error ?? "Failed."),
      });
    });
  }

  return (
    <div className="space-y-6">
      {status ? (
        <Alert variant={status.kind === "error" ? "error" : "success"}>{status.text}</Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">Current password</Label>
              <PasswordInput
                id="currentPassword"
                name="currentPassword"
                autoComplete="current-password"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">New password</Label>
              <PasswordInput
                id="newPassword"
                name="newPassword"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <PasswordStrengthMeter password={newPassword} />
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
            <Button type="submit" disabled={isPending}>
              Update password
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Active sessions</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleRevokeOthers} disabled={isPending}>
                Sign out of all other devices
              </Button>
              <form action={signOutAction}>
                <Button type="submit" variant="destructive" size="sm">
                  Sign out
                </Button>
              </form>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {sessions.map((s) => (
            <div
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{s.userAgent.slice(0, 70)}</span>
                  {s.isCurrent ? <Badge variant="success">This device</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  IP: {s.ipAddress} | Last active: {s.lastActiveFormatted}
                </p>
              </div>
              {!s.isCurrent ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRevoke(s.id)}
                  disabled={isPending}
                >
                  Revoke
                </Button>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
