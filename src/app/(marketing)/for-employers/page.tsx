import { MarketingShell } from "@/components/layouts/marketing-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SUPPORT_EMAIL, SUPPORT_PHONE } from "@/lib/constants";

export default function ForEmployersPage() {
  return (
    <MarketingShell>
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-4xl space-y-4 px-4 py-16 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            For employers
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Employer schemes
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Register your organisation so eligible employees can access vehicle repair financing
            through monthly payroll deductions with a partner bank.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Register your organisation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Employers only receive the monthly deduction schedule, never repair details.</p>
            <p>
              Contact our scheme onboarding team at{" "}
              <span className="font-medium text-foreground">{SUPPORT_EMAIL}</span> or{" "}
              <span className="font-medium text-foreground">{SUPPORT_PHONE}</span>.
            </p>
          </CardContent>
        </Card>
      </section>
    </MarketingShell>
  );
}
