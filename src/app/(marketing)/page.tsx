import { ArrowRight, Briefcase, Car } from "lucide-react";
import Link from "next/link";
import { MarketingShell } from "@/components/layouts/marketing-shell";
import { getDefaultPortalForContext, getSessionContext } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

const steps = [
  { label: "Book an inspection", detail: "Create your account and book a diagnostic slot." },
  { label: "Approve the scope", detail: "Review the priced repair scope and e-sign only what you choose." },
  { label: "Get financed", detail: "Your financing partner pays Ask AutoParts directly." },
  { label: "Drive away", detail: "Your vehicle is repaired and you repay over time." },
];

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
      <section className="border-b border-border bg-surface">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:py-24">
          <div className="space-y-7">
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl lg:text-[56px]">
              Get your vehicle repaired now and pay through a financing partner.
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground">
              Your financing partner pays Ask AutoParts directly so you can get back on the road
              faster.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/sign-up?next=/apply"
                className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-brand px-6 text-[15px] font-semibold text-brand-foreground transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
              >
                Create account to apply
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/fnpl"
                className="inline-flex min-h-12 items-center rounded-lg border border-border-strong bg-surface px-6 text-[15px] font-semibold text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
              >
                How it works
              </Link>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-3xl bg-brand p-8 sm:p-10">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full border-[40px] border-white/20"
            />
            <p className="relative text-xs font-semibold uppercase tracking-[0.12em] text-foreground/80">
              How it works
            </p>
            <ol className="relative mt-6 space-y-5">
              {steps.map((step, index) => (
                <li key={step.label} className="flex gap-4">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                    {index + 1}
                  </span>
                  <div>
                    <p className="text-[15px] font-semibold text-foreground">{step.label}</p>
                    <p className="text-sm text-foreground/80">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="mb-10 max-w-2xl space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Who it&apos;s for
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-foreground">
            Repayment that fits how you earn
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface p-7">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-surface-muted text-foreground">
              <Car className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="mt-5 text-lg font-semibold text-foreground">Ride-hailing drivers</h3>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <p>For drivers on any ride-hailing app.</p>
              <p>Daily repayment through our financing partner.</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-7">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-surface-muted text-foreground">
              <Briefcase className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="mt-5 text-lg font-semibold text-foreground">Salaried employees</h3>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <p>For employees of registered scheme employers.</p>
              <p>Monthly payroll deduction through your employer&apos;s partner bank.</p>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
