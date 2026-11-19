import { AuthShell } from "@/components/layouts/auth-shell";
import { AcceptInviteForm } from "./accept-invite-form";

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <AuthShell
      title="Accept your invitation"
      subtitle="Set your password, then enrol your authenticator app."
    >
      <AcceptInviteForm token={decodeURIComponent(token)} />
    </AuthShell>
  );
}
