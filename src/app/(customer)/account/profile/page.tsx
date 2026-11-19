import { eq } from "drizzle-orm";
import { decryptField, maskNationalId } from "@/lib/crypto";
import { requireCustomer } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { customers } from "@/server/db/schema";
import { ProfileForms } from "./profile-forms";

export const dynamic = "force-dynamic";

export default async function AccountProfilePage() {
  const ctx = await requireCustomer({ verified: false, nextPath: "/account/profile" });
  let maskedNationalId: string | null = null;

  if (ctx.actor.customerId) {
    const [cust] = await getDb()
      .select({ nationalIdEnc: customers.nationalIdEnc })
      .from(customers)
      .where(eq(customers.id, ctx.actor.customerId))
      .limit(1);

    if (cust?.nationalIdEnc) {
      try {
        maskedNationalId = maskNationalId(decryptField(cust.nationalIdEnc));
      } catch {
        maskedNationalId = "*****";
      }
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
      <ProfileForms
        fullName={ctx.user.name}
        email={ctx.user.email}
        phoneNumber={ctx.user.phoneNumber}
        maskedNationalId={maskedNationalId}
      />
    </div>
  );
}
