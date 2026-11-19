import { MarketingShell } from "@/components/layouts/marketing-shell";
import { CONSENT_NOTICE_VERSION } from "@/lib/constants";

export default function ConsentNoticePage() {
  return (
    <MarketingShell>
      <article className="mx-auto max-w-3xl space-y-4 px-4 py-12 sm:px-6 text-sm leading-relaxed">
        <h1 className="text-2xl font-bold">FNPL Consent Notice</h1>
        <p className="text-xs text-muted-foreground">
          Version: {CONSENT_NOTICE_VERSION} (Placeholder pending counsel review — O25)
        </p>
        <p>
          By accepting this notice during your application, you consent to Ask AutoParts collecting
          your identity, vehicle, diagnostic inspection, and supporting financial records and
          sharing the completed application package with the assigned financing partner.
        </p>
        <p>
          No logbook surrender and no vehicle tracker are required. Your financing partner pays Ask
          AutoParts directly.
        </p>
      </article>
    </MarketingShell>
  );
}
