import Link from "next/link";
import { MarketingShell } from "@/components/layouts/marketing-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDefaultPortalForContext, getSessionContext } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const ctx = await getSessionContext();
  const portalHref = ctx ? getDefaultPortalForContext(ctx) : "/account";
  const portalLabel =
    portalHref === "/assessor"
      ? "Assessor Portal"
      : portalHref === "/garage"
        ? "Garage Portal"
        : portalHref === "/admin"
          ? "Operations Portal"
          : portalHref === "/lender"
            ? "Lender Portal"
            : "My Account";

  return (
    <MarketingShell isSignedIn={Boolean(ctx)} portalHref={portalHref} portalLabel={portalLabel}>
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="max-w-2xl space-y-6">
          <Badge variant="accent">Ask AutoParts | Fix Now, Pay Later</Badge>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Get your vehicle repaired now and pay through a financing partner.
          </h1>
          <p className="text-base text-muted-foreground">
            Your financing partner pays Ask AutoParts directly so you can get back on the road
            faster.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/sign-up?next=/apply"
              className="inline-flex min-h-11 items-center rounded-md bg-brand px-6 text-sm font-medium text-brand-foreground hover:bg-brand-hover"
            >
              Create account to apply
            </Link>
            <Link
              href="/fnpl"
              className="inline-flex min-h-11 items-center rounded-md border border-border-strong bg-surface px-6 text-sm font-medium text-foreground hover:bg-surface-muted"
            >
              How it works
            </Link>
          </div>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Ride-hailing drivers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>For drivers on any ride-hailing app.</p>
              <p>Daily repayment through our financing partner.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Salaried employees</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>For employees of registered scheme employers.</p>
              <p>Monthly payroll deduction through your employer&apos;s partner bank.</p>
            </CardContent>
          </Card>
        </div>
      </section>
    </MarketingShell>
  );
}
