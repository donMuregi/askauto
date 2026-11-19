import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKenyanDate } from "@/lib/format";
import { requireCustomer } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { applications } from "@/server/db/schema";

export const dynamic = "force-dynamic";

export default async function AccountApplicationsPage() {
  const ctx = await requireCustomer({ verified: true, nextPath: "/account/applications" });
  const rows = ctx.actor.customerId
    ? await getDb()
        .select()
        .from(applications)
        .where(eq(applications.customerId, ctx.actor.customerId))
        .orderBy(desc(applications.createdAt))
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
        <Link
          href="/apply"
          className="inline-flex min-h-10 items-center rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand-hover"
        >
          Start application
        </Link>
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            You have not started an application yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((app) => (
            <Card key={app.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    {app.reference ?? "Draft (reference assigned after details)"}
                  </CardTitle>
                  <Badge variant="brand">{app.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>
                  {app.productCode} | {formatKenyanDate(app.createdAt)}
                </span>
                <Link
                  href={
                    app.reference
                      ? `/account/applications/${encodeURIComponent(app.reference)}`
                      : `/apply/${app.id}/details`
                  }
                  className="font-medium text-accent hover:underline"
                >
                  Open
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
