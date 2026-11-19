import { MarketingShell } from "@/components/layouts/marketing-shell";
import { TERMS_VERSION } from "@/lib/constants";

export default function TermsPage() {
  return (
    <MarketingShell>
      <article className="mx-auto max-w-3xl space-y-4 px-4 py-12 sm:px-6 text-sm leading-relaxed">
        <h1 className="text-2xl font-bold">Terms of Use</h1>
        <p className="text-xs text-muted-foreground">Version: {TERMS_VERSION} (Placeholder pending legal review — O25)</p>
        <p>
          Ask AutoParts provides the Fix Now, Pay Later workflow platform connecting customers,
          diagnostic assessors, garages, and independent financing partners. Ask AutoParts does not
          issue loans or handle loan funds. Your financing partner pays Ask AutoParts directly upon
          approval.
        </p>
        <p>
          The pre-inspection fee of KES 1,500 is the only fee collected by the platform and is never
          financed.
        </p>
      </article>
    </MarketingShell>
  );
}
