import { AuthShell } from "@/components/layouts/auth-shell";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; mode?: string; phone?: string }>;
}) {
  const params = await searchParams;
  const smsMode = params.mode === "sms";

  return (
    <AuthShell title="Choose a new password">
      <ResetPasswordForm
        token={params.token}
        smsMode={smsMode}
        initialPhone={params.phone}
      />
    </AuthShell>
  );
}
