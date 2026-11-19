import { render } from "@react-email/render";
import type { ReactElement } from "react";
import {
  DuplicateSignupTemplate,
  EmailChangeNoticeTemplate,
  InviteTemplate,
  LockoutTemplate,
  MfaResetTemplate,
  NewDeviceTemplate,
  PasswordChangedTemplate,
  PasswordResetTemplate,
  VerifyEmailTemplate,
  WelcomeEmailTemplate,
} from "./auth-templates";

export type EmailTemplateKey =
  | "auth.verify_email"
  | "auth.welcome"
  | "auth.password_reset"
  | "auth.password_changed"
  | "auth.duplicate_signup"
  | "auth.email_change_notice"
  | "auth.lockout"
  | "auth.invite"
  | "auth.mfa_reset"
  | "auth.new_device";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function getString(payload: Record<string, unknown>, key: string, fallback = ""): string {
  const val = payload[key];
  return typeof val === "string" ? val : fallback;
}

export function buildEmailElement(
  template: EmailTemplateKey,
  payload: Record<string, unknown>,
): { subject: string; element: ReactElement } {
  switch (template) {
    case "auth.verify_email":
      return {
        subject: "Verify your Ask AutoParts email",
        element: VerifyEmailTemplate({ url: getString(payload, "url") }),
      };
    case "auth.welcome":
      return {
        subject: "Your Ask AutoParts account is ready",
        element: WelcomeEmailTemplate({ applyUrl: getString(payload, "applyUrl") }),
      };
    case "auth.password_reset":
      return {
        subject: "Reset your Ask AutoParts password",
        element: PasswordResetTemplate({ url: getString(payload, "url") }),
      };
    case "auth.password_changed":
      return {
        subject: "Your Ask AutoParts password was changed",
        element: PasswordChangedTemplate({ signInUrl: getString(payload, "signInUrl") }),
      };
    case "auth.duplicate_signup":
      return {
        subject: "You already have an Ask AutoParts account",
        element: DuplicateSignupTemplate({
          signInUrl: getString(payload, "signInUrl"),
          resetUrl: getString(payload, "resetUrl"),
        }),
      };
    case "auth.email_change_notice": {
      const stage = payload.stage === "completed" ? "completed" : "requested";
      return {
        subject:
          stage === "completed"
            ? "Your Ask AutoParts email was changed"
            : "Email change requested on your Ask AutoParts account",
        element: EmailChangeNoticeTemplate({
          stage,
          newEmailMasked: getString(payload, "newEmailMasked", "your new address"),
        }),
      };
    }
    case "auth.lockout":
      return {
        subject: "Unusual sign-in attempts on your Ask AutoParts account",
        element: LockoutTemplate({ resetUrl: getString(payload, "resetUrl") }),
      };
    case "auth.invite":
      return {
        subject: "Invitation to Ask AutoParts FNPL",
        element: InviteTemplate({
          inviteUrl: getString(payload, "inviteUrl"),
          roleLabel: getString(payload, "roleLabel", "portal user"),
        }),
      };
    case "auth.mfa_reset":
      return {
        subject: "Your two-factor authentication was reset",
        element: MfaResetTemplate({ signInUrl: getString(payload, "signInUrl") }),
      };
    case "auth.new_device":
      return {
        subject: "New sign-in to your Ask AutoParts account",
        element: NewDeviceTemplate({
          occurredAtEat: getString(payload, "occurredAtEat"),
          location: getString(payload, "location", "Unknown"),
          resetUrl: getString(payload, "resetUrl"),
        }),
      };
  }
}

export async function renderEmailTemplate(
  template: EmailTemplateKey,
  payload: Record<string, unknown>,
): Promise<RenderedEmail> {
  const { subject, element } = buildEmailElement(template, payload);
  const [html, text] = await Promise.all([
    render(element),
    render(element, { plainText: true }),
  ]);
  return { subject, html, text };
}

export const SAMPLE_EMAIL_PAYLOADS: Record<EmailTemplateKey, Record<string, unknown>> = {
  "auth.verify_email": { url: "http://localhost:3000/verify-email/sample-token" },
  "auth.welcome": { applyUrl: "http://localhost:3000/apply" },
  "auth.password_reset": { url: "http://localhost:3000/reset-password?token=sample-token" },
  "auth.password_changed": { signInUrl: "http://localhost:3000/sign-in" },
  "auth.duplicate_signup": {
    signInUrl: "http://localhost:3000/sign-in",
    resetUrl: "http://localhost:3000/forgot-password",
  },
  "auth.email_change_notice": { stage: "requested", newEmailMasked: "n***@example.com" },
  "auth.lockout": { resetUrl: "http://localhost:3000/forgot-password" },
  "auth.invite": {
    inviteUrl: "http://localhost:3000/accept-invite/sample-token",
    roleLabel: "Ops Reviewer",
  },
  "auth.mfa_reset": { signInUrl: "http://localhost:3000/sign-in" },
  "auth.new_device": {
    occurredAtEat: "19 November 2026, 14:30 EAT",
    location: "Nairobi, KE",
    resetUrl: "http://localhost:3000/forgot-password",
  },
};
