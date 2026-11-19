import Link from "next/link";
import { MarketingShell } from "@/components/layouts/marketing-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const stages = [
  { stage: "A. Find and book", detail: "Create and verify your account, confirm eligibility, and book your diagnostic inspection slot." },
  { stage: "B. Inspect and approve", detail: "Certified assessor completes a diagnostic report. You review the priced scope and e-sign only the work you choose." },
  { stage: "C. Apply", detail: "Upload required documents. Ask AutoParts reviews and forwards your package to the financing partner." },
  { stage: "D. Decide and pay out", detail: "Accept your financing partner's offer. Your financing partner pays Ask AutoParts directly." },
  { stage: "E. Repair and repay", detail: "Your vehicle is repaired, handed over with warranty, and you repay your financing partner directly." },
];

export default function FnplHowItWorksPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-5xl space-y-10 px-4 py-14 sm:px-6">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">How Fix Now, Pay Later works</h1>
          <p className="text-base text-muted-foreground">
            No logbook surrender. No vehicle tracker. Your financing partner pays Ask AutoParts
            directly.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {stages.map((s) => (
            <Card key={s.stage}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{s.stage}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{s.detail}</CardContent>
            </Card>
          ))}
        </div>

        <div>
          <Link
            href="/sign-up?next=/apply"
            className="inline-flex min-h-11 items-center rounded-md bg-brand px-6 text-sm font-medium text-brand-foreground hover:bg-brand-hover"
          >
            Create account to apply
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
