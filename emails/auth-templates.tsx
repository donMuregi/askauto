import { Text } from "@react-email/components";
import { SUPPORT_EMAIL, SUPPORT_PHONE } from "@/lib/constants";
import { EmailLayout } from "./layout";

const pStyle = {
  fontSize: "14px",
  lineHeight: "22px",
  color: "#0f172a",
  margin: "0 0 12px 0",
};

export function VerifyEmailTemplate({ url }: { url: string }) {
  return (
    <EmailLayout
      preview="Verify your email address to activate your Ask AutoParts account."
      heading="Verify your email address"
      ctaLabel="Verify email"
      ctaUrl={url}
      footerNote="This link expires in 24 hours. If you did not create an account, ignore this email."
    >
      <Text style={pStyle}>
        Confirm your email address so you can complete verification and start your Fix Now, Pay
        Later application.
      </Text>
    </EmailLayout>
  );
}

export function WelcomeEmailTemplate({ applyUrl }: { applyUrl: string }) {
  return (
    <EmailLayout
      preview="Your Ask AutoParts account is verified. Start your application."
      heading="Your account is verified"
      ctaLabel="Start your application"
      ctaUrl={applyUrl}
    >
      <Text style={pStyle}>
        Your account is verified. You can now start your vehicle repair financing application.
      </Text>
      <Text style={pStyle}>
        Your financing partner pays Ask AutoParts directly.
      </Text>
    </EmailLayout>
  );
}

export function PasswordResetTemplate({ url }: { url: string }) {
  return (
    <EmailLayout
      preview="Reset your Ask AutoParts account password."
      heading="Reset your password"
      ctaLabel="Reset password"
      ctaUrl={url}
      footerNote="This single-use link expires in 30 minutes. If you did not request a reset, ignore this email."
    >
      <Text style={pStyle}>
        Use the link below to choose a new password for your Ask AutoParts account.
      </Text>
    </EmailLayout>
  );
}

export function PasswordChangedTemplate({ signInUrl }: { signInUrl: string }) {
  return (
    <EmailLayout
      preview="Your Ask AutoParts password was changed."
      heading="Your password was changed"
      ctaLabel="Sign in"
      ctaUrl={signInUrl}
      footerNote={`Not you? Contact support immediately at ${SUPPORT_EMAIL} or ${SUPPORT_PHONE}.`}
    >
      <Text style={pStyle}>
        The password for your Ask AutoParts account was updated and all active sessions were signed
        out.
      </Text>
    </EmailLayout>
  );
}

export function DuplicateSignupTemplate({
  signInUrl,
  resetUrl,
}: {
  signInUrl: string;
  resetUrl: string;
}) {
  return (
    <EmailLayout
      preview="An Ask AutoParts account already exists for this email address."
      heading="You already have an account"
      ctaLabel="Sign in"
      ctaUrl={signInUrl}
      footerNote={`Need to reset your password? Visit ${resetUrl}`}
    >
      <Text style={pStyle}>
        Someone attempted to create an account using this email address. You can sign in to your
        existing account or reset your password if you forgot it.
      </Text>
    </EmailLayout>
  );
}

export function EmailChangeNoticeTemplate({
  stage,
  newEmailMasked,
}: {
  stage: "requested" | "completed";
  newEmailMasked: string;
}) {
  return (
    <EmailLayout
      preview="Email address update on your Ask AutoParts account."
      heading={stage === "requested" ? "Email change requested" : "Email address changed"}
      footerNote={`Not you? Contact support at ${SUPPORT_EMAIL} or ${SUPPORT_PHONE}.`}
    >
      <Text style={pStyle}>
        {stage === "requested"
          ? `A request was made to change your account email to ${newEmailMasked}. The change will only take effect after the new address is verified.`
          : `Your account email address has been changed to ${newEmailMasked}.`}
      </Text>
    </EmailLayout>
  );
}

export function LockoutTemplate({ resetUrl }: { resetUrl: string }) {
  return (
    <EmailLayout
      preview="Unusual sign-in attempts on your Ask AutoParts account."
      heading="Unusual sign-in attempts"
      ctaLabel="Reset password"
      ctaUrl={resetUrl}
      footerNote={`Need help? Contact ${SUPPORT_EMAIL} or ${SUPPORT_PHONE}.`}
    >
      <Text style={pStyle}>
        There were multiple failed sign-in attempts on your account. Sign-in is temporarily locked
        for 15 minutes. If this was not you, reset your password.
      </Text>
    </EmailLayout>
  );
}

export function InviteTemplate({
  inviteUrl,
  roleLabel,
}: {
  inviteUrl: string;
  roleLabel: string;
}) {
  return (
    <EmailLayout
      preview="You have been invited to Ask AutoParts FNPL."
      heading="Accept your invitation"
      ctaLabel="Set up your account"
      ctaUrl={inviteUrl}
      footerNote="This invitation expires in 72 hours. Two-factor authentication setup is required."
    >
      <Text style={pStyle}>
        An administrator invited you to join Ask AutoParts FNPL ({roleLabel}). Set your password
        and enrol your authenticator app to access your portal.
      </Text>
    </EmailLayout>
  );
}

export function MfaResetTemplate({ signInUrl }: { signInUrl: string }) {
  return (
    <EmailLayout
      preview="Two-factor authentication was reset on your account."
      heading="Two-factor authentication reset"
      ctaLabel="Sign in and enrol"
      ctaUrl={signInUrl}
      footerNote={`If you did not request this reset, contact ${SUPPORT_EMAIL} immediately.`}
    >
      <Text style={pStyle}>
        An administrator reset your two-factor authentication. You will be required to enrol a new
        authenticator app the next time you sign in.
      </Text>
    </EmailLayout>
  );
}

export function NewDeviceTemplate({
  occurredAtEat,
  location,
  resetUrl,
}: {
  occurredAtEat: string;
  location: string;
  resetUrl: string;
}) {
  return (
    <EmailLayout
      preview="New sign-in to your Ask AutoParts account."
      heading="New sign-in to your account"
      ctaLabel="This was not me"
      ctaUrl={resetUrl}
    >
      <Text style={pStyle}>
        A new sign-in occurred on {occurredAtEat} (approximate location: {location}). If this was
        you, no action is needed.
      </Text>
    </EmailLayout>
  );
}
