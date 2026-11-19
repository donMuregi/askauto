import { redirect } from "next/navigation";
import { CONSENT_NOTICE_VERSION } from "@/lib/constants";
import { requireCustomer } from "@/server/auth/guards";
import { CONSENT_NOTICE_TEXT, getApplicationForStep } from "@/server/domain/applications/service";
import { DetailsForm } from "./details-form";

export const dynamic = "force-dynamic";

export default async function ApplyDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireCustomer({ verified: true, nextPath: `/apply/${id}/details` });
  const app = await getApplicationForStep(ctx.actor, id);

  if (app.status !== "DRAFT" && app.reference) {
    redirect(`/account/applications/${encodeURIComponent(app.reference)}`);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">Step 2 of 3</p>
        <h1 className="text-2xl font-semibold tracking-tight">Vehicle details and consent</h1>
      </div>

      <DetailsForm
        applicationId={app.id}
        productCode={app.productCode}
        userName={ctx.user.name}
        userEmail={ctx.user.email}
        userPhone={ctx.user.phoneNumber}
        yearsInService={app.yearsInService}
        consentNoticeText={CONSENT_NOTICE_TEXT}
        consentVersion={CONSENT_NOTICE_VERSION}
      />
    </div>
  );
}
