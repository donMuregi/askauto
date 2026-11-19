import { AuthShell } from "@/components/layouts/auth-shell";
import { requireUser } from "@/server/auth/guards";
import { safeNext } from "@/server/auth/safe-next";
import { MfaSetupForm } from "./mfa-setup-form";

export const dynamic = "force-dynamic";

export default async function MfaSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const ctx = await requireUser({ nextPath: "/mfa/setup" });
  const params = await searchParams;
  const fallback = ctx.user.kind === "lender" ? "/lender" : "/admin";
  const nextPath = safeNext(params.next, fallback);

  return (
    <AuthShell
      title="Set up two-factor authentication"
      subtitle="Add the key to your authenticator app, save your recovery codes, and confirm with a code."
    >
      <MfaSetupForm nextPath={nextPath} />
    </AuthShell>
  );
}
