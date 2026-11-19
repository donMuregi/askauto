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
      subtitle="Set your name and password to access your portal."
    >
      <AcceptInviteForm token={decodeURIComponent(token)} />
    </AuthShell>
  );
}
