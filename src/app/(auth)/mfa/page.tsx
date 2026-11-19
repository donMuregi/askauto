import { AuthShell } from "@/components/layouts/auth-shell";
import { requireUser } from "@/server/auth/guards";
import { safeNext } from "@/server/auth/safe-next";
import { MfaChallengeForm } from "./mfa-challenge-form";

export const dynamic = "force-dynamic";

export default async function MfaChallengePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const ctx = await requireUser({ nextPath: "/mfa" });
  const params = await searchParams;
  const fallback = ctx.user.kind === "lender" ? "/lender" : "/admin";
  const nextPath = safeNext(params.next, fallback);

  return (
    <AuthShell
      title="Two-factor verification"
      subtitle="Enter the code from your authenticator app."
    >
      <MfaChallengeForm nextPath={nextPath} />
    </AuthShell>
  );
}
