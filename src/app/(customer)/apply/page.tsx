import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireCustomer } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

export default async function ApplyEntryPage() {
  // Strictly requires both email and phone verification before starting an application
  await requireCustomer({ verified: true, nextPath: "/apply" });

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">How do you earn?</h1>
        <p className="text-sm text-muted-foreground">
          Choose the option that matches how you earn. KES 1,500 is the only fee, and it is never
          financed.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>I drive for Uber, Bolt or another app</CardTitle>
            <CardDescription>Daily repayment through Fund Flow Capital (Uber and Bolt).</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Application funnel forms ship in Phase 4 (Task 4.3).
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>I am a salaried employee</CardTitle>
            <CardDescription>Monthly payroll deduction through your employer scheme.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Employer scheme lookup ships in Phase 4 (Task 4.3).
            </p>
          </CardContent>
        </Card>
      </div>

      <div>
        <Link href="/account" className="text-sm font-medium text-accent hover:underline">
          Back to My Account
        </Link>
      </div>
    </div>
  );
}
