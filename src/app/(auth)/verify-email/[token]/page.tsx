import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/layouts/auth-shell";
import { Alert } from "@/components/ui/alert";
import { safeNext } from "@/server/auth/safe-next";
import { verifyEmailTokenService } from "@/server/auth/service";

export const dynamic = "force-dynamic";

export default async function VerifyEmailTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const nextPath = safeNext(sp.next, "/apply");
  const decoded = decodeURIComponent(token);

  const result = await verifyEmailTokenService(decoded);

  if (result.verified) {
    if (result.accountVerified) {
      redirect(nextPath);
    }
    redirect(`/verify?next=${encodeURIComponent(nextPath)}`);
  }

  return (
    <AuthShell title="Verification link expired">
      <div className="space-y-4">
        <Alert variant="error">
          This verification link is invalid or has expired. Sign in to request a new link.
        </Alert>
        <Link
          href={`/sign-in?next=${encodeURIComponent("/verify")}`}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand-hover"
        >
          Go to sign in
        </Link>
      </div>
    </AuthShell>
  );
}
