import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { MarketingShell } from "@/components/layouts/marketing-shell";

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
      <section className="border-b border-border bg-surface">
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-16 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Fix Now, Pay Later
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            How Fix Now, Pay Later works
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Your financing partner pays Ask AutoParts directly so you can get your vehicle repaired
            and repay over time.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <ol className="relative space-y-4">
          {stages.map((s, index) => {
            const [letter, ...rest] = s.stage.split(". ");
            return (
              <li
                key={s.stage}
                className="flex gap-5 rounded-2xl border border-border bg-surface p-6 sm:p-7"
              >
                <span
                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                    index === 0 ? "bg-brand text-brand-foreground" : "bg-foreground text-background"
                  }`}
                  aria-hidden="true"
                >
                  {letter}
                </span>
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-foreground">
                    <span className="sr-only">{letter}. </span>
                    {rest.join(". ")}
                  </h2>
                  <p className="text-sm text-muted-foreground">{s.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-10 flex flex-col items-start justify-between gap-5 rounded-3xl bg-foreground p-8 sm:flex-row sm:items-center sm:p-10">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight text-background">
              Ready to get back on the road?
            </h2>
            <p className="text-sm text-background/70">It only takes a few minutes to get started.</p>
          </div>
          <Link
            href="/sign-up?next=/apply"
            className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-brand px-6 text-[15px] font-semibold text-brand-foreground transition-colors hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            Create account to apply
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
