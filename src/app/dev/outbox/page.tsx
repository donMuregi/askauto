import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getEnv } from "@/lib/env";
import { listDevOutboxEntries } from "@/server/integrations/notifications/dev-store";

export const dynamic = "force-dynamic";

export default function DevOutboxPage() {
  const env = getEnv();
  if (env.NODE_ENV === "production" || env.INTEGRATIONS_MODE !== "fake") {
    notFound();
  }

  const entries = listDevOutboxEntries();

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Development Outbox</h1>
        <Badge variant="brand">INTEGRATIONS_MODE=fake</Badge>
      </div>
      {entries.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No messages captured yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => (
            <Card key={entry.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    {entry.channel === "email" ? entry.subject : entry.purpose ?? "SMS"}
                  </CardTitle>
                  <Badge variant={entry.channel === "sms" ? "brand" : "accent"}>
                    {entry.channel.toUpperCase()}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  To: {entry.to} | {entry.createdAt}
                </p>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap rounded bg-surface-muted p-3 text-xs">
                  {entry.bodyText}
                </pre>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
