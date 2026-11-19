import { AuthShell } from "@/components/layouts/auth-shell";
import { safeNext } from "@/server/auth/safe-next";
import { SignUpForm } from "./sign-up-form";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const nextPath = safeNext(params.next, "/apply");

  return (
    <AuthShell
      title="Create your Ask AutoParts account"
      subtitle="You need an account to apply. It takes about 2 minutes."
    >
      <SignUpForm nextPath={nextPath} />
    </AuthShell>
  );
}
