import { MarketingShell } from "@/components/layouts/marketing-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SUPPORT_EMAIL, SUPPORT_PHONE } from "@/lib/constants";

export default function ForEmployersPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-4xl space-y-6 px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-bold tracking-tight">Employer schemes</h1>
        <p className="text-base text-muted-foreground">
          Register your organisation so eligible employees can access vehicle repair financing
          through monthly payroll deductions with a partner bank.
        </p>
        <Card>
          <CardHeader>
            <CardTitle>Register your organisation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Employers only receive the monthly deduction schedule, never repair details.</p>
            <p>
              Contact our scheme onboarding team at {SUPPORT_EMAIL} or {SUPPORT_PHONE}.
            </p>
          </CardContent>
        </Card>
      </section>
    </MarketingShell>
  );
}
