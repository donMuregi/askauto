"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { markNotificationReadAction, setNotificationPreferences } from "../actions";

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAtFormatted: string;
}

interface NotificationsPanelProps {
  notifications: NotificationItem[];
  preferences: { email: boolean; sms: boolean; whatsapp: boolean };
}

export function NotificationsPanel({ notifications, preferences }: NotificationsPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  function handleMarkRead(id: string) {
    startTransition(async () => {
      await markNotificationReadAction(id);
    });
  }

  function handlePrefsSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);
    const fd = new FormData(event.currentTarget);
    startTransition(async () => {
      const res = await setNotificationPreferences(fd);
      setStatus({
        kind: res.ok ? "success" : "error",
        text: res.ok ? (res.message ?? "Saved.") : (res.error ?? "Could not save preferences."),
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
          <CardTitle>Inbox</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-border p-3 text-sm"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{n.title}</span>
                    {!n.read ? <Badge variant="brand">Unread</Badge> : null}
                  </div>
                  <p className="text-muted-foreground">{n.body}</p>
                  <p className="text-xs text-muted-foreground">{n.createdAtFormatted}</p>
                </div>
                <div className="flex items-center gap-2">
                  {n.link ? (
                    <Link href={n.link} className="text-xs font-medium text-accent hover:underline">
                      View
                    </Link>
                  ) : null}
                  {!n.read ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleMarkRead(n.id)}
                      disabled={isPending}
                    >
                      Mark read
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notification preferences</CardTitle>
          <CardDescription>
            Transactional messages (security codes, fee receipts, offers, and status updates) are
            always sent and cannot be turned off.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handlePrefsSubmit} className="space-y-3">
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                name="email"
                defaultChecked={preferences.email}
                className="h-4 w-4 accent-foreground"
              />
              Email reminders
            </label>
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                name="sms"
                defaultChecked={preferences.sms}
                className="h-4 w-4 accent-foreground"
              />
              SMS reminders (quiet hours 21:00 to 07:00 EAT)
            </label>
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                name="whatsapp"
                defaultChecked={preferences.whatsapp}
                className="h-4 w-4 accent-foreground"
              />
              WhatsApp updates (opt-in)
            </label>
            <Button type="submit" disabled={isPending}>
              Save preferences
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
