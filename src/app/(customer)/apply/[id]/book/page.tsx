import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";
import { requireCustomer } from "@/server/auth/guards";
import {
  getApplicationForStep,
  getAvailableSlots,
  getDailyEstimateConfigSetting,
  getInspectionFeeSetting,
  listActiveGarages,
} from "@/server/domain/applications/service";
import { BookForm } from "./book-form";

export const dynamic = "force-dynamic";

export default async function ApplyBookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireCustomer({ verified: true, nextPath: `/apply/${id}/book` });
  const app = await getApplicationForStep(ctx.actor, id);

  if (!app.reference) {
    redirect(`/apply/${app.id}/details`);
  }
  if (app.status !== "DRAFT") {
    redirect(`/account/applications/${encodeURIComponent(app.reference)}`);
  }

  const [garages, feeKes, estimateConfig] = await Promise.all([
    listActiveGarages(),
    getInspectionFeeSetting(),
    getDailyEstimateConfigSetting(),
  ]);

  const slots = garages[0] ? await getAvailableSlots(garages[0].id) : [];
  const env = getEnv();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-accent">Step 3 of 3</p>
        <h1 className="text-2xl font-semibold tracking-tight">Book your inspection</h1>
      </div>

      <BookForm
        applicationId={app.id}
        reference={app.reference}
        productCode={app.productCode}
        garages={garages}
        slots={slots}
        defaultPhone={ctx.user.phoneNumber ?? ""}
        feeKes={feeKes}
        estimateConfig={estimateConfig}
        isFakeMode={env.INTEGRATIONS_MODE === "fake" && env.NODE_ENV !== "production"}
      />
    </div>
  );
}
