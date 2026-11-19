import { MarketingShell } from "@/components/layouts/marketing-shell";
import { PRIVACY_VERSION, SUPPORT_EMAIL } from "@/lib/constants";

export default function PrivacyPage() {
  return (
    <MarketingShell>
      <article className="mx-auto max-w-3xl space-y-4 px-4 py-12 sm:px-6 text-sm leading-relaxed">
        <h1 className="text-2xl font-bold">Privacy Notice</h1>
        <p className="text-xs text-muted-foreground">
          Version: {PRIVACY_VERSION} (Placeholder pending counsel review — O17/O25)
        </p>
        <p>
          Ask AutoParts processes personal data in accordance with the Kenya Data Protection Act
          2019. National ID numbers are encrypted at rest and masked in the interface.
        </p>
        <p>
          Lenders receive only the submitted document package for applications assigned to them.
          Scheme employers receive only the monthly deduction schedule, never repair details.
        </p>
        <p>
          Request data export or account deletion in My Account under Privacy, or contact{" "}
          {SUPPORT_EMAIL}.
        </p>
      </article>
    </MarketingShell>
  );
}
