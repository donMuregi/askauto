import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKenyanDate } from "@/lib/format";
import { requireCustomer } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { applications, paymentAttestations } from "@/server/db/schema";
import { CUSTOMER_STATUS_LABELS } from "@/server/domain/applications/transition";

export const dynamic = "force-dynamic";

export default async function AccountDashboardPage() {
  const ctx = await requireCustomer({ verified: true, nextPath: "/account" });
  const db = getDb();

  const apps = ctx.actor.customerId
    ? await db
        .select()
        .from(applications)
        .where(eq(applications.customerId, ctx.actor.customerId))
        .orderBy(desc(applications.createdAt))
        .limit(5)
    : [];

  const activeApp = apps.find((a) => a.isActive);
  let activeFundsAcknowledged = false;
  if (activeApp) {
    const [fundsRow] = await db
      .select({ id: paymentAttestations.id })
      .from(paymentAttestations)
      .where(
        and(
          inArray(paymentAttestations.applicationId, [activeApp.id]),
          eq(paymentAttestations.kind, "funds_received"),
        ),
      )
      .limit(1);
    activeFundsAcknowledged = Boolean(fundsRow);
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      {activeApp ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>{activeApp.reference ?? "Draft application"}</CardTitle>
              <Badge variant={activeFundsAcknowledged ? "success" : "brand"}>
                {activeFundsAcknowledged
                  ? "Application complete"
                  : CUSTOMER_STATUS_LABELS[activeApp.status]}
              </Badge>
            </div>
            <CardDescription>
              Product: {activeApp.productCode === "RIDE_HAILING" ? "Ride-hailing" : "Salaried scheme"} | Started{" "}
              {formatKenyanDate(activeApp.createdAt)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href={
                activeApp.reference
                  ? `/account/applications/${encodeURIComponent(activeApp.reference)}`
                  : `/apply/${activeApp.id}/details`
              }
              className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-brand-foreground hover:bg-brand-hover"
            >
              {activeFundsAcknowledged ? "View application" : "Continue your application"}
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Start your application</CardTitle>
            <CardDescription>
              Our financing partner pays Ask AutoParts directly once your application is approved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/apply"
              className="inline-flex min-h-11 items-center rounded-lg bg-brand px-5 text-sm font-semibold text-brand-foreground hover:bg-brand-hover"
            >
              Start your application
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
