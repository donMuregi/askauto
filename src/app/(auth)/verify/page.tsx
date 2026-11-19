import { redirect } from "next/navigation";
import { AuthShell } from "@/components/layouts/auth-shell";
import { getSessionContext } from "@/server/auth/guards";
import { safeNext } from "@/server/auth/safe-next";
import { VerifyChecklist } from "./verify-checklist";

export const dynamic = "force-dynamic";

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeNext(params.next, "/apply");
  const ctx = await getSessionContext();

  if (!ctx) {
    return (
      <AuthShell
        title="Check your email to continue"
        subtitle="Open the verification link we sent to your email address, then sign in."
      >
        <p className="text-sm text-muted-foreground">
          If you already have an account, check your inbox for sign-in or password reset
          instructions.
        </p>
      </AuthShell>
    );
  }

  if (ctx.user.emailVerified || ctx.user.phoneNumberVerified) {
    redirect(nextPath);
  }

  return (
    <AuthShell
      title="Verify your account"
      subtitle="Verify either your phone number or your email address to continue."
    >
      <VerifyChecklist
        email={ctx.user.email}
        emailVerified={ctx.user.emailVerified}
        phoneNumber={ctx.user.phoneNumber}
        phoneNumberVerified={ctx.user.phoneNumberVerified}
        nextPath={nextPath}
      />
    </AuthShell>
  );
}
