"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isDomainError } from "@/lib/errors";
import { getAuth } from "@/server/auth/auth";
import { requireUser } from "@/server/auth/guards";
import { getRequestMeta } from "@/server/auth/request-meta";
import { safeNext } from "@/server/auth/safe-next";
import {
  acceptInviteSchema,
  forgotPasswordSchema,
  mfaCodeSchema,
  resetPasswordEmailSchema,
  resetPasswordPhoneSchema,
  signInSchema,
  signUpSchema,
  verifyPhoneOtpSchema,
} from "@/server/auth/schemas";
import {
  acceptInvitationService,
  completePasswordResetByEmailService,
  completePasswordResetByPhoneService,
  markSessionMfaVerified,
  requestPasswordResetService,
  resendEmailVerificationService,
  sendPhoneOtpService,
  signInWithIdentifierService,
  signUpCustomerService,
  verifyPhoneOtpService,
} from "@/server/auth/service";
import { getDb } from "@/server/db/client";
import { recordAuthEvent } from "@/server/domain/audit";

export interface AuthActionResult {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string>;
  redirectTo?: string;
  requiresCaptcha?: boolean;
  smsSentFlow?: boolean;
}

function mapError(err: unknown): AuthActionResult {
  if (isDomainError(err)) {
    return {
      ok: false,
      error: err.message,
      requiresCaptcha: Boolean(err.details?.requiresCaptcha),
    };
  }
  return {
    ok: false,
    error: "Something went wrong. Try again.",
  };
}

export async function signUpCustomerAction(formData: FormData): Promise<AuthActionResult> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    acceptTerms: formData.get("acceptTerms") === "on" || formData.get("acceptTerms") === "true",
    turnstileToken: String(formData.get("turnstileToken") ?? "fake-pass"),
    next: typeof formData.get("next") === "string" ? String(formData.get("next")) : undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your details.", fieldErrors };
  }

  const meta = await getRequestMeta();
  const cookieStore = await cookies();
  const sourceCode = cookieStore.get("fnpl_source_code")?.value ?? null;

  try {
    const res = await signUpCustomerService({
      fullName: parsed.data.fullName,
      email: parsed.data.email,
      phone: parsed.data.phone,
      password: parsed.data.password,
      turnstileToken: parsed.data.turnstileToken,
      next: parsed.data.next,
      sourceCode,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { ok: true, message: res.message, redirectTo: res.redirectTo };
  } catch (err) {
    return mapError(err);
  }
}

export async function signInAction(formData: FormData): Promise<AuthActionResult> {
  const parsed = signInSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
    keepSignedIn: formData.get("keepSignedIn") !== "false" && formData.get("keepSignedIn") !== null,
    turnstileToken: String(formData.get("turnstileToken") ?? "fake-pass"),
    next: typeof formData.get("next") === "string" ? String(formData.get("next")) : undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter your sign-in details." };
  }

  const meta = await getRequestMeta();
  try {
    const res = await signInWithIdentifierService({
      identifier: parsed.data.identifier,
      password: parsed.data.password,
      keepSignedIn: parsed.data.keepSignedIn,
      turnstileToken: parsed.data.turnstileToken,
      next: parsed.data.next,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { ok: true, redirectTo: res.redirectTo };
  } catch (err) {
    return mapError(err);
  }
}

export async function resendEmailVerificationAction(next?: string): Promise<AuthActionResult> {
  try {
    const ctx = await requireUser({ mode: "throw" });
    await resendEmailVerificationService({
      userId: ctx.user.id,
      email: ctx.user.email,
      next,
    });
    return { ok: true, message: "Verification email sent. Check your inbox." };
  } catch (err) {
    return mapError(err);
  }
}

export async function sendPhoneOtpAction(): Promise<AuthActionResult> {
  try {
    const ctx = await requireUser({ mode: "throw" });
    if (!ctx.user.phoneNumber) {
      return { ok: false, error: "No phone number is registered on this account." };
    }
    await sendPhoneOtpService({
      userId: ctx.user.id,
      phoneNumber: ctx.user.phoneNumber,
      ip: ctx.actor.ip,
    });
    return { ok: true, message: "Verification code sent by SMS." };
  } catch (err) {
    return mapError(err);
  }
}

export async function verifyPhoneOtpAction(formData: FormData): Promise<AuthActionResult> {
  const parsed = verifyPhoneOtpSchema.safeParse({
    code: formData.get("code"),
    next: typeof formData.get("next") === "string" ? String(formData.get("next")) : undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter the 6-digit code." };
  }

  try {
    const ctx = await requireUser({ mode: "throw" });
    if (!ctx.user.phoneNumber) {
      return { ok: false, error: "No phone number is registered on this account." };
    }
    const { bothVerified } = await verifyPhoneOtpService({
      userId: ctx.user.id,
      phoneNumber: ctx.user.phoneNumber,
      code: parsed.data.code,
    });

    if (bothVerified) {
      return { ok: true, redirectTo: safeNext(parsed.data.next, "/apply") };
    }
    return { ok: true, message: "Phone number verified. Verify your email to continue." };
  } catch (err) {
    return mapError(err);
  }
}

export async function forgotPasswordAction(formData: FormData): Promise<AuthActionResult> {
  const parsed = forgotPasswordSchema.safeParse({
    identifier: formData.get("identifier"),
    channel: formData.get("channel") === "sms" ? "sms" : "auto",
    turnstileToken: String(formData.get("turnstileToken") ?? "fake-pass"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter your email or phone." };
  }

  const meta = await getRequestMeta();
  try {
    const res = await requestPasswordResetService({
      identifier: parsed.data.identifier,
      channel: parsed.data.channel,
      turnstileToken: parsed.data.turnstileToken,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { ok: true, message: res.message, smsSentFlow: res.smsSentFlow };
  } catch (err) {
    return mapError(err);
  }
}

export async function resetPasswordEmailAction(formData: FormData): Promise<AuthActionResult> {
  const parsed = resetPasswordEmailSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your password details." };
  }

  const meta = await getRequestMeta();
  try {
    await completePasswordResetByEmailService({
      compositeToken: parsed.data.token,
      password: parsed.data.password,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { ok: true, redirectTo: "/sign-in?reset=1" };
  } catch (err) {
    return mapError(err);
  }
}

export async function resetPasswordPhoneAction(formData: FormData): Promise<AuthActionResult> {
  const parsed = resetPasswordPhoneSchema.safeParse({
    phone: formData.get("phone"),
    code: formData.get("code"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your code and password." };
  }

  const meta = await getRequestMeta();
  try {
    await completePasswordResetByPhoneService({
      phone: parsed.data.phone,
      code: parsed.data.code,
      password: parsed.data.password,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { ok: true, redirectTo: "/sign-in?reset=1" };
  } catch (err) {
    return mapError(err);
  }
}

export async function acceptInviteAction(formData: FormData): Promise<AuthActionResult> {
  const parsed = acceptInviteSchema.safeParse({
    token: formData.get("token"),
    fullName: formData.get("fullName"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your details." };
  }

  const meta = await getRequestMeta();
  try {
    const res = await acceptInvitationService({
      rawToken: parsed.data.token,
      fullName: parsed.data.fullName,
      password: parsed.data.password,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    const next = res.kind === "lender" ? "/lender" : "/admin";
    return { ok: true, redirectTo: `/mfa/setup?next=${encodeURIComponent(next)}` };
  } catch (err) {
    return mapError(err);
  }
}

export async function startTotpEnrollmentAction(
  password: string,
): Promise<{ ok: boolean; totpURI?: string; backupCodes?: string[]; error?: string }> {
  try {
    await requireUser({ mode: "throw" });
    const res = await getAuth().api.enableTwoFactor({
      body: { password, method: "totp", issuer: "Ask AutoParts" },
      headers: await headers(),
    });
    if (!("totpURI" in res)) {
      return { ok: false, error: "Authenticator setup did not return a TOTP key." };
    }
    return {
      ok: true,
      totpURI: res.totpURI,
      backupCodes: res.backupCodes,
    };
  } catch (err) {
    const mapped = mapError(err);
    return { ok: false, error: mapped.error ?? "Could not start authenticator setup." };
  }
}

export async function verifyMfaChallengeAction(formData: FormData): Promise<AuthActionResult> {
  const parsed = mfaCodeSchema.safeParse({
    code: formData.get("code"),
    isRecoveryCode: formData.get("isRecoveryCode") === "true",
    next: typeof formData.get("next") === "string" ? String(formData.get("next")) : undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter a valid code." };
  }

  try {
    const ctx = await requireUser({ mode: "throw" });
    const hdrs = await headers();
    if (parsed.data.isRecoveryCode) {
      await getAuth().api.verifyBackupCode({
        body: { code: parsed.data.code },
        headers: hdrs,
      });
    } else {
      await getAuth().api.verifyTOTP({
        body: { code: parsed.data.code },
        headers: hdrs,
      });
    }

    await markSessionMfaVerified(ctx.sessionId, ctx.user.id, ctx.actor.ip, ctx.actor.userAgent);
    const defaultPortal = ctx.user.kind === "lender" ? "/lender" : "/admin";
    return { ok: true, redirectTo: safeNext(parsed.data.next, defaultPortal) };
  } catch {
    return {
      ok: false,
      error: "Verification code is invalid or expired. Check your authenticator app and try again.",
    };
  }
}

export async function signOutAction(): Promise<void> {
  const meta = await getRequestMeta();
  try {
    const ctx = await requireUser({ mode: "throw" });
    await getAuth().api.signOut({ headers: await headers() });
    await recordAuthEvent({
      db: getDb(),
      userId: ctx.user.id,
      type: "sign_out",
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
  } catch {
    // Already signed out
  }
  redirect("/sign-in");
}
