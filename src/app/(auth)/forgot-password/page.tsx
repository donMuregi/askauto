import { AuthShell } from "@/components/layouts/auth-shell";
import { ForgotPasswordForm } from "./forgot-password-form";

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email address or phone number."
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
