import Link from "next/link";
import { redirect } from "next/navigation";
import { requireCustomer } from "@/server/auth/guards";
import {
  getActiveCustomerApplication,
  listActiveSchemeEmployers,
} from "@/server/domain/applications/service";
import { ApplyStartSelector } from "./apply-start-selector";

export const dynamic = "force-dynamic";

export default async function ApplyEntryPage() {
  const ctx = await requireCustomer({ verified: true, nextPath: "/apply" });
  const activeApp = await getActiveCustomerApplication(ctx.actor);

  if (activeApp) {
    if (activeApp.status !== "DRAFT" && activeApp.reference) {
      redirect(`/account/applications/${encodeURIComponent(activeApp.reference)}`);
    }
    if (activeApp.reference) {
      redirect(`/apply/${activeApp.id}/book`);
    }
    redirect(`/apply/${activeApp.id}/details`);
  }

  const employers = await listActiveSchemeEmployers();

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">How do you earn?</h1>
        <p className="text-sm text-muted-foreground">
          Choose the option that matches how you earn to start your application.
        </p>
      </div>

      <ApplyStartSelector employers={employers} />

      <div>
        <Link href="/account" className="text-sm font-medium text-accent hover:underline">
          Back to My Account
        </Link>
      </div>
    </div>
  );
}
