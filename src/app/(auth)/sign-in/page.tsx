import { AuthShell } from "@/components/layouts/auth-shell";
import { safeNext } from "@/server/auth/safe-next";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string; error?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeNext(params.next, "/account");

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
