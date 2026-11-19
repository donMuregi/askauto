import { redirect } from "next/navigation";
import { AuthShell } from "@/components/layouts/auth-shell";
import { getDefaultPortalForContext, getSessionContext } from "@/server/auth/guards";
import { safeNext } from "@/server/auth/safe-next";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string; error?: string }>;
}) {
  const ctx = await getSessionContext();
  if (ctx) {
    redirect(getDefaultPortalForContext(ctx));
  }

  const params = await searchParams;
  const nextPath = params.next ? safeNext(params.next, "") : "";

  return (
    <AuthShell title="Sign in to Ask AutoParts">
      <SignInForm
        nextPath={nextPath}
        resetCompleted={params.reset === "1"}
        ipBlocked={params.error === "ip_not_allowed"}
      />
    </AuthShell>
  );
}
