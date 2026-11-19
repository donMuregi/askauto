"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import {
  lenderChangePasswordAction,
  lenderRevokeOtherSessionsAction,
  lenderRevokeSessionAction,
} from "../actions";

interface SessionItem {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  lastActiveFormatted: string;
  isCurrent: boolean;
}

export function LenderAccountForms({ sessions }: { sessions: SessionItem[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pwFeedback, setPwFeedback] = useState<{ type: "success" | "error"; text: string } | null>(
    null,
  );
  const [sessionFeedback, setSessionFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  function onPasswordSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPwFeedback(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const res = await lenderChangePasswordAction(formData);
      if (!res.ok) {
        setPwFeedback({ type: "error", text: res.error ?? "Could not change password." });
        return;
      }
      form.reset();
      setPwFeedback({ type: "success", text: res.message ?? "Password updated." });
      router.refresh();
    });
  }

  function onRevoke(sessionId: string) {
    setSessionFeedback(null);
    startTransition(async () => {
      const res = await lenderRevokeSessionAction(sessionId);
      if (!res.ok) {
        setSessionFeedback({ type: "error", text: res.error ?? "Failed to revoke session." });
        return;
      }
      setSessionFeedback({ type: "success", text: res.message ?? "Session revoked." });
      router.refresh();
    });
  }

  function onRevokeOthers() {
    setSessionFeedback(null);
    startTransition(async () => {
      const res = await lenderRevokeOtherSessionsAction();
      if (!res.ok) {
        setSessionFeedback({ type: "error", text: res.error ?? "Failed to revoke sessions." });
        return;
      }
      setSessionFeedback({
        type: "success",
        text: res.message ?? "Signed out of all other devices.",
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
          <CardDescription>
            Minimum 12 characters. Changing your password signs out all other active sessions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onPasswordSubmit} className="space-y-4 max-w-md">
            {pwFeedback ? (
              <Alert variant={pwFeedback.type === "error" ? "error" : "success"}>
                {pwFeedback.text}
              </Alert>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="currentPassword">Current password</Label>
              <PasswordInput id="currentPassword" name="currentPassword" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">New password</Label>
              <PasswordInput id="newPassword" name="newPassword" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm new password</Label>
              <PasswordInput id="confirmPassword" name="confirmPassword" required />
            </div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Updating..." : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Active sessions</CardTitle>
            <CardDescription>
              Lender sessions time out after 30 minutes of inactivity or 8 hours absolute.
            </CardDescription>
          </div>
          {sessions.length > 1 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={onRevokeOthers}
            >
              Sign out other devices
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {sessionFeedback ? (
            <Alert variant={sessionFeedback.type === "error" ? "error" : "success"}>
              {sessionFeedback.text}
            </Alert>
          ) : null}

          <ul className="space-y-2 text-sm">
            {sessions.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs">{s.ipAddress ?? "Unknown IP"}</span>
                    {s.isCurrent ? <Badge variant="success">Current device</Badge> : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.userAgent ?? "Browser session"} | Last active {s.lastActiveFormatted}
                  </p>
                </div>
                {!s.isCurrent ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={() => onRevoke(s.id)}
                  >
                    Revoke
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
