import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, desc, eq, gt, inArray, ne, notInArray } from "drizzle-orm";
import { headers } from "next/headers";
import { uuidv7 } from "uuidv7";
import { TERMS_VERSION, TERMINAL_APPLICATION_STATUSES } from "@/lib/constants";
import { hmacHash, sha256Hex } from "@/lib/crypto";
import { getEnv } from "@/lib/env";
import { DomainError } from "@/lib/errors";
import { isIpInAllowlist } from "@/lib/ip";
import { validatePasswordPolicy } from "@/lib/password-policy";
import { normalizeIdentifier, normalizeKenyanPhone } from "@/lib/phone";
import { getDb } from "@/server/db/client";
import type { Actor, LenderRole, StaffRole } from "@/server/db/rls";
import {
  account,
  applications,
  customers,
  invitations,
  lenders,
  lenderUsers,
  mfaResetRequests,
  privacyRequests,
  session as sessionTable,
  staffProfiles,
  twoFactor,
  user as userTable,
} from "@/server/db/schema";
import { audit, recordAuthEvent } from "@/server/domain/audit";
import { dispatchImmediateAuthNotification } from "@/server/domain/notifications/outbox";
import { verifyTurnstileToken } from "@/server/integrations/turnstile";
import { authorize } from "@/server/policies/can";
import { getAuth } from "./auth";
import { checkAndIncrementRateLimit, getRateLimitState, resetRateLimit } from "./rate-limit";
import { safeNext } from "./safe-next";
import {
  createVerificationRecord,
  equaliseTiming,
  generateSecureToken,
  generateSixDigitOtp,
  verifyAndConsumeToken,
} from "./tokens";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  return `${local[0] ?? "*"}***@${domain}`;
}

async function getCredentialAccount(userId: string) {
  const db = getDb();
  const [acc] = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .limit(1);
  return acc ?? null;
}

export async function signUpCustomerService(params: {
  fullName: string;
  email: string;
  phone: string;
  password: string;
  turnstileToken?: string;
  next?: string;
  sourceCode?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{
  status: "created" | "check_email";
  redirectTo: string;
  message: string;
}> {
  const startedAt = Date.now();
  const env = getEnv();
  const db = getDb();

  const captchaOk = await verifyTurnstileToken(params.turnstileToken, params.ip);
  if (!captchaOk) {
    throw new DomainError(
      "CAPTCHA_FAILED",
      "Security verification failed. Complete the check and try again.",
      400,
    );
  }

  const normalizedEmail = params.email.trim().toLowerCase();
  const normalizedPhone = normalizeKenyanPhone(params.phone);
  if (!normalizedPhone) {
    throw new DomainError(
      "VALIDATION_ERROR",
      "Enter a valid Kenyan mobile number starting with 07, 01, or +254.",
      400,
    );
  }

  const policyResult = await validatePasswordPolicy(params.password, {
    skipHibp: env.INTEGRATIONS_MODE === "fake" || env.NODE_ENV === "test",
  });
  if (!policyResult.valid) {
    throw new DomainError("VALIDATION_ERROR", policyResult.reason ?? "Choose a stronger password.", 400);
  }

  const nextPath = safeNext(params.next, "/apply");

  // Check duplicate email first without revealing existence
  const [existingEmailUser] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.email, normalizedEmail))
    .limit(1);

  if (existingEmailUser) {
    await dispatchImmediateAuthNotification({
      type: "auth.duplicate_signup",
      userId: existingEmailUser.id,
      payload: {
        toEmail: normalizedEmail,
        signInUrl: `${env.APP_URL}/sign-in?next=${encodeURIComponent(nextPath)}`,
        resetUrl: `${env.APP_URL}/forgot-password`,
      },
      dedupeKey: `auth.duplicate_signup:${existingEmailUser.id}:${Math.floor(Date.now() / 60000)}`,
    });

    await equaliseTiming(startedAt, 300);
    return {
      status: "check_email",
      redirectTo: `/verify?next=${encodeURIComponent(nextPath)}`,
      message: "Check your email to continue.",
    };
  }

  // Duplicate phone check
  const [existingPhoneUser] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.phoneNumber, normalizedPhone))
    .limit(1);

  if (existingPhoneUser) {
    throw new DomainError(
      "CONFLICT",
      "We could not use this phone number. Try a different one or sign in.",
      409,
    );
  }

  const passwordHash = await hashPassword(params.password);
  const userId = uuidv7();
  const now = new Date();
  const emailToken = generateSecureToken();
  const phoneOtp = generateSixDigitOtp();

  await db.transaction(async (tx) => {
    await tx.insert(userTable).values({
      id: userId,
      name: params.fullName.trim(),
      email: normalizedEmail,
      emailVerified: false,
      phoneNumber: normalizedPhone,
      phoneNumberVerified: false,
      twoFactorEnabled: false,
      kind: "customer",
      status: "active",
      locale: "en",
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: now,
    });

    await tx.insert(account).values({
      id: uuidv7(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
    });

    await tx.insert(customers).values({
      userId,
      sourceCode: params.sourceCode ?? null,
    });

    await createVerificationRecord(tx, {
      identifier: `verify-email:${userId}`,
      tokenHash: emailToken.hash,
      ttlSeconds: 60 * 60 * 24,
      maxAttempts: 1,
      meta: { email: normalizedEmail },
    });

    await createVerificationRecord(tx, {
      identifier: `verify-phone:${userId}`,
      tokenHash: phoneOtp.hash,
      ttlSeconds: 300,
      maxAttempts: 3,
      meta: { phone: normalizedPhone },
    });

    await recordAuthEvent({
      db: tx,
      userId,
      type: "sign_up",
      identifierHash: hmacHash(normalizedEmail),
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
    });
  });

  // Sign the customer in immediately so they can complete /verify
  try {
    await getAuth().api.signInEmail({
      body: {
        email: normalizedEmail,
        password: params.password,
        rememberMe: true,
      },
      headers: await headers(),
    });
  } catch {
    // Session cookie setting may be unavailable outside request context (e.g. unit tests)
  }

  const verifyUrl = `${env.APP_URL}/verify-email/${encodeURIComponent(`${userId}.${emailToken.raw}`)}?next=${encodeURIComponent(nextPath)}`;

  await dispatchImmediateAuthNotification({
    type: "auth.verify_email",
    userId,
    payload: {
      toEmail: normalizedEmail,
      url: verifyUrl,
    },
    dedupeKey: `auth.verify_email:${userId}:${emailToken.hash.slice(0, 12)}`,
  });

  await dispatchImmediateAuthNotification({
    type: "auth.otp",
    userId,
    payload: {
      toPhone: normalizedPhone,
      code: phoneOtp.raw,
      expiresMinutes: 5,
    },
    dedupeKey: `auth.otp:${userId}:${phoneOtp.hash.slice(0, 12)}`,
  });

  await equaliseTiming(startedAt, 300);
  return {
    status: "created",
    redirectTo: `/verify?next=${encodeURIComponent(nextPath)}`,
    message: "Check your email to continue.",
  };
}

export async function resendEmailVerificationService(params: {
  userId: string;
  email: string;
  next?: string;
}): Promise<void> {
  const limit = await checkAndIncrementRateLimit({
    key: `resend-email:${params.userId}`,
    maxRequests: 3,
    windowSeconds: 3600,
  });
  if (!limit.allowed) {
    throw new DomainError(
      "RATE_LIMITED",
      "Too many verification emails sent. Wait an hour before requesting another.",
      429,
    );
  }

  const env = getEnv();
  const db = getDb();
  const token = generateSecureToken();

  await createVerificationRecord(db, {
    identifier: `verify-email:${params.userId}`,
    tokenHash: token.hash,
    ttlSeconds: 60 * 60 * 24,
    maxAttempts: 1,
    meta: { email: params.email },
  });

  const nextPath = safeNext(params.next, "/apply");
  const verifyUrl = `${env.APP_URL}/verify-email/${encodeURIComponent(`${params.userId}.${token.raw}`)}?next=${encodeURIComponent(nextPath)}`;

  await dispatchImmediateAuthNotification({
    type: "auth.verify_email",
    userId: params.userId,
    payload: { toEmail: params.email, url: verifyUrl },
    dedupeKey: `auth.verify_email:${params.userId}:${token.hash.slice(0, 12)}`,
  });
}

export async function verifyEmailTokenService(compositeToken: string): Promise<{
  verified: boolean;
  accountVerified: boolean;
}> {
  const parts = compositeToken.split(".");
  if (parts.length !== 2) {
    return { verified: false, accountVerified: false };
  }
  const [userId, rawToken] = parts;
  if (!userId || !rawToken) {
    return { verified: false, accountVerified: false };
  }

  const result = await verifyAndConsumeToken({
    identifier: `verify-email:${userId}`,
    rawToken,
  });

  if (!result.ok) {
    return { verified: false, accountVerified: false };
  }

  const db = getDb();
  const now = new Date();
  const newEmail = typeof result.meta?.newEmail === "string" ? result.meta.newEmail : null;
  const oldEmail = typeof result.meta?.oldEmail === "string" ? result.meta.oldEmail : null;

  const updateFields: Partial<typeof userTable.$inferInsert> = {
    emailVerified: true,
    updatedAt: now,
  };
  if (newEmail) {
    updateFields.email = newEmail;
  }

  const [updated] = await db
    .update(userTable)
    .set(updateFields)
    .where(eq(userTable.id, userId))
    .returning();

  if (!updated) {
    return { verified: false, accountVerified: false };
  }

  if (newEmail && oldEmail) {
    await recordAuthEvent({
      db,
      userId,
      type: "email_changed",
      identifierHash: hmacHash(newEmail),
    });
    await dispatchImmediateAuthNotification({
      type: "auth.email_change_notice",
      userId,
      payload: {
        toEmail: oldEmail,
        stage: "completed",
        newEmailMasked: maskEmail(newEmail),
      },
      dedupeKey: `auth.email_changed:${userId}:${now.getTime()}`,
    });
  }

  const accountVerified = Boolean(updated.emailVerified || updated.phoneNumberVerified);
  if (accountVerified && !newEmail) {
    const env = getEnv();
    await dispatchImmediateAuthNotification({
      type: "auth.welcome",
      userId,
      payload: {
        toEmail: updated.email,
        applyUrl: `${env.APP_URL}/apply`,
      },
      dedupeKey: `auth.welcome:${userId}`,
    });
  }

  return { verified: true, accountVerified };
}

export async function sendPhoneOtpService(params: {
  userId: string;
  phoneNumber: string;
  ip?: string | null;
  identifierPrefix?: "verify-phone" | "change-phone";
}): Promise<void> {
  const normalizedPhone = normalizeKenyanPhone(params.phoneNumber);
  if (!normalizedPhone) {
    throw new DomainError("VALIDATION_ERROR", "Enter a valid Kenyan mobile number.", 400);
  }

  // Lock check after 5 wrong codes in 30 minutes
  const lockState = await getRateLimitState({
    key: `phone-otp-lock:${hmacHash(normalizedPhone)}`,
    windowSeconds: 1800,
  });
  if (lockState.count >= 5) {
    throw new DomainError(
      "ACCOUNT_LOCKED",
      "Phone verification is locked for 30 minutes due to repeated incorrect codes.",
      429,
    );
  }

  // 60-second resend cooldown
  const cooldown = await checkAndIncrementRateLimit({
    key: `sms-cooldown:${hmacHash(normalizedPhone)}`,
    maxRequests: 1,
    windowSeconds: 60,
  });
  if (!cooldown.allowed) {
    throw new DomainError(
      "RATE_LIMITED",
      `Wait ${cooldown.retryAfterSeconds} seconds before requesting another SMS code.`,
      429,
    );
  }

  // 3 per hour per number
  const phoneHourly = await checkAndIncrementRateLimit({
    key: `sms-hourly:${hmacHash(normalizedPhone)}`,
    maxRequests: 3,
    windowSeconds: 3600,
  });
  if (!phoneHourly.allowed) {
    throw new DomainError(
      "RATE_LIMITED",
      "Too many SMS codes requested for this number. Try again in an hour.",
      429,
    );
  }

  // 10 per day per IP
  if (params.ip) {
    const ipDaily = await checkAndIncrementRateLimit({
      key: `sms-ip-daily:${hmacHash(params.ip)}`,
      maxRequests: 10,
      windowSeconds: 86400,
    });
    if (!ipDaily.allowed) {
      throw new DomainError(
        "RATE_LIMITED",
        "Daily SMS limit reached from this network. Try again tomorrow.",
        429,
      );
    }
  }

  const otp = generateSixDigitOtp();
  const prefix = params.identifierPrefix ?? "verify-phone";
  await createVerificationRecord(getDb(), {
    identifier: `${prefix}:${params.userId}`,
    tokenHash: otp.hash,
    ttlSeconds: 300,
    maxAttempts: 3,
    meta: { phone: normalizedPhone },
  });

  await dispatchImmediateAuthNotification({
    type: "auth.otp",
    userId: params.userId,
    payload: {
      toPhone: normalizedPhone,
      code: otp.raw,
      expiresMinutes: 5,
    },
    dedupeKey: `auth.otp:${params.userId}:${otp.hash.slice(0, 12)}`,
  });
}

export async function verifyPhoneOtpService(params: {
  userId: string;
  phoneNumber: string;
  code: string;
}): Promise<{ accountVerified: boolean }> {
  const normalizedPhone = normalizeKenyanPhone(params.phoneNumber);
  if (!normalizedPhone) {
    throw new DomainError("VALIDATION_ERROR", "Phone number on account is invalid.", 400);
  }

  const lockKey = `phone-otp-lock:${hmacHash(normalizedPhone)}`;
  const lockState = await getRateLimitState({ key: lockKey, windowSeconds: 1800 });
  if (lockState.count >= 5) {
    throw new DomainError(
      "ACCOUNT_LOCKED",
      "Phone verification is locked for 30 minutes after too many wrong codes.",
      429,
    );
  }

  const result = await verifyAndConsumeToken({
    identifier: `verify-phone:${params.userId}`,
    rawToken: params.code.trim(),
  });

  if (!result.ok) {
    await checkAndIncrementRateLimit({
      key: lockKey,
      maxRequests: 5,
      windowSeconds: 1800,
    });

    if (result.reason === "max_attempts") {
      throw new DomainError(
        "VALIDATION_ERROR",
        "Verification code expired after 3 failed attempts. Request a new code.",
        400,
      );
    }
    throw new DomainError(
      "VALIDATION_ERROR",
      "Verification code is invalid or expired. Check the code and try again.",
      400,
    );
  }

  await resetRateLimit(lockKey);

  const db = getDb();
  const [updated] = await db
    .update(userTable)
    .set({ phoneNumberVerified: true, updatedAt: new Date() })
    .where(eq(userTable.id, params.userId))
    .returning();

  const accountVerified = Boolean(updated?.emailVerified || updated?.phoneNumberVerified);
  if (accountVerified && updated) {
    const env = getEnv();
    await dispatchImmediateAuthNotification({
      type: "auth.welcome",
      userId: updated.id,
      payload: {
        toEmail: updated.email,
        applyUrl: `${env.APP_URL}/apply`,
      },
      dedupeKey: `auth.welcome:${updated.id}`,
    });
  }

  return { accountVerified };
}

export async function signInWithIdentifierService(params: {
  identifier: string;
  password: string;
  keepSignedIn: boolean;
  turnstileToken?: string;
  next?: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{
  redirectTo: string;
  requiresCaptcha?: boolean;
}> {
  const startedAt = Date.now();
  const db = getDb();
  const env = getEnv();

  const normalized = normalizeIdentifier(params.identifier);
  const identifierHash = hmacHash(normalized?.value ?? params.identifier.trim().toLowerCase());
  const accountFailKey = `signin-fail-acct:${identifierHash}`;
  const ipFailKey = params.ip ? `signin-fail-ip:${hmacHash(params.ip)}` : null;

  const acctFailures = await getRateLimitState({ key: accountFailKey, windowSeconds: 900 });
  const ipFailures = ipFailKey
    ? await getRateLimitState({ key: ipFailKey, windowSeconds: 900 })
    : { count: 0, retryAfterSeconds: 0 };

  if (acctFailures.count >= 5 || ipFailures.count >= 20) {
    await equaliseTiming(startedAt, 300);
    throw new DomainError(
      "ACCOUNT_LOCKED",
      "Too many failed sign-in attempts. Wait 15 minutes and try again.",
      429,
      { requiresCaptcha: true },
    );
  }

  if (acctFailures.count >= 3 || ipFailures.count >= 10) {
    const captchaOk = await verifyTurnstileToken(params.turnstileToken, params.ip);
    if (!captchaOk) {
      throw new DomainError(
        "CAPTCHA_FAILED",
        "Complete the security check before trying again.",
        400,
        { requiresCaptcha: true },
      );
    }
  }

  const recordFailure = async (userId?: string | null, userEmail?: string | null) => {
    await recordAuthEvent({
      db,
      userId: userId ?? null,
      type: "sign_in_failure",
      identifierHash,
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
    });

    const nextAcct = await checkAndIncrementRateLimit({
      key: accountFailKey,
      maxRequests: 5,
      windowSeconds: 900,
    });
    if (ipFailKey) {
      await checkAndIncrementRateLimit({
        key: ipFailKey,
        maxRequests: 20,
        windowSeconds: 900,
      });
    }

    if (nextAcct.count >= 5 && userId && userEmail) {
      await recordAuthEvent({
        db,
        userId,
        type: "account_locked",
        identifierHash,
        ip: params.ip ?? null,
        userAgent: params.userAgent ?? null,
      });

      const lockoutNoticeLimit = await checkAndIncrementRateLimit({
        key: `lockout-email:${userId}`,
        maxRequests: 1,
        windowSeconds: 3600,
      });
      if (lockoutNoticeLimit.allowed) {
        await dispatchImmediateAuthNotification({
          type: "auth.lockout",
          userId,
          payload: {
            toEmail: userEmail,
            resetUrl: `${env.APP_URL}/forgot-password`,
          },
          dedupeKey: `auth.lockout:${userId}:${Math.floor(Date.now() / 3600000)}`,
        });
      }
    }
  };

  if (!normalized) {
    await recordFailure();
    await equaliseTiming(startedAt, 300);
    throw new DomainError("UNAUTHENTICATED", "Email, phone or password is incorrect.", 401);
  }

  const [foundUser] = await db
    .select()
    .from(userTable)
    .where(
      normalized.kind === "email"
        ? eq(userTable.email, normalized.value)
        : eq(userTable.phoneNumber, normalized.value),
    )
    .limit(1);

  if (!foundUser || foundUser.status !== "active") {
    await recordFailure(foundUser?.id, foundUser?.email);
    await equaliseTiming(startedAt, 300);
    throw new DomainError("UNAUTHENTICATED", "Email, phone or password is incorrect.", 401);
  }

  // Lender IP allowlist enforcement at sign-in
  if (foundUser.kind === "lender") {
    const [lenderRow] = await db
      .select({
        status: lenders.status,
        ipAllowlist: lenders.ipAllowlist,
      })
      .from(lenderUsers)
      .innerJoin(lenders, eq(lenderUsers.lenderId, lenders.id))
      .where(eq(lenderUsers.userId, foundUser.id))
      .limit(1);

    if (!lenderRow || lenderRow.status !== "active") {
      await equaliseTiming(startedAt, 300);
      throw new DomainError("UNAUTHENTICATED", "Email, phone or password is incorrect.", 401);
    }
    if (!isIpInAllowlist(params.ip, lenderRow.ipAllowlist)) {
      throw new DomainError(
        "IP_NOT_ALLOWED",
        "Sign-in from this IP address is not permitted for your organisation.",
        403,
      );
    }
  }

  const credAccount = await getCredentialAccount(foundUser.id);
  if (!credAccount?.password) {
    await recordFailure(foundUser.id, foundUser.email);
    await equaliseTiming(startedAt, 300);
    throw new DomainError("UNAUTHENTICATED", "Email, phone or password is incorrect.", 401);
  }

  const passwordValid = await verifyPassword({
    hash: credAccount.password,
    password: params.password,
  });

  if (!passwordValid) {
    await recordFailure(foundUser.id, foundUser.email);
    await equaliseTiming(startedAt, 300);
    throw new DomainError("UNAUTHENTICATED", "Email, phone or password is incorrect.", 401);
  }

  await resetRateLimit(accountFailKey);

  // Establish session via Better Auth
  await getAuth().api.signInEmail({
    body: {
      email: foundUser.email,
      password: params.password,
      rememberMe: params.keepSignedIn,
    },
    headers: await headers(),
  });

  const now = new Date();
  await db
    .update(userTable)
    .set({ lastSignInAt: now, updatedAt: now })
    .where(eq(userTable.id, foundUser.id));

  await recordAuthEvent({
    db,
    userId: foundUser.id,
    type: "sign_in_success",
    identifierHash,
    ip: params.ip ?? null,
    userAgent: params.userAgent ?? null,
  });

  if (foundUser.kind === "staff" || foundUser.kind === "lender") {
    const defaultPortal = foundUser.kind === "lender" ? "/lender" : "/admin";
    const target = safeNext(params.next, defaultPortal);
    if (!foundUser.twoFactorEnabled) {
      return { redirectTo: `/mfa/setup?next=${encodeURIComponent(target)}` };
    }
    return { redirectTo: `/mfa?next=${encodeURIComponent(target)}` };
  }

  const customerTarget = safeNext(params.next, "/account");
  if (!foundUser.emailVerified && !foundUser.phoneNumberVerified) {
    return { redirectTo: `/verify?next=${encodeURIComponent(customerTarget)}` };
  }

  return { redirectTo: customerTarget };
}

export async function requestPasswordResetService(params: {
  identifier: string;
  channel: "auto" | "sms";
  turnstileToken?: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ message: string; smsSentFlow: boolean }> {
  const startedAt = Date.now();
  const env = getEnv();
  const db = getDb();

  const captchaOk = await verifyTurnstileToken(params.turnstileToken, params.ip);
  if (!captchaOk) {
    throw new DomainError(
      "CAPTCHA_FAILED",
      "Security verification failed. Complete the check and try again.",
      400,
    );
  }

  if (params.ip) {
    const ipLimit = await checkAndIncrementRateLimit({
      key: `pw-reset-ip:${hmacHash(params.ip)}`,
      maxRequests: 10,
      windowSeconds: 3600,
    });
    if (!ipLimit.allowed) {
      throw new DomainError(
        "RATE_LIMITED",
        "Too many password reset requests. Wait an hour before trying again.",
        429,
      );
    }
  }

  const neutralResponse = {
    message: "If an account exists for that email or phone, we have sent instructions.",
    smsSentFlow: params.channel === "sms" || (!params.identifier.includes("@")),
  };

  const normalized = normalizeIdentifier(params.identifier);
  if (!normalized) {
    await equaliseTiming(startedAt, 300);
    return neutralResponse;
  }

  const [foundUser] = await db
    .select()
    .from(userTable)
    .where(
      normalized.kind === "email"
        ? eq(userTable.email, normalized.value)
        : eq(userTable.phoneNumber, normalized.value),
    )
    .limit(1);

  if (!foundUser || foundUser.status !== "active") {
    await equaliseTiming(startedAt, 300);
    return neutralResponse;
  }

  const acctLimit = await checkAndIncrementRateLimit({
    key: `pw-reset-user:${foundUser.id}`,
    maxRequests: 3,
    windowSeconds: 3600,
  });
  if (!acctLimit.allowed) {
    await equaliseTiming(startedAt, 300);
    return neutralResponse;
  }

  await recordAuthEvent({
    db,
    userId: foundUser.id,
    type: "password_reset_requested",
    identifierHash: hmacHash(normalized.value),
    ip: params.ip ?? null,
    userAgent: params.userAgent ?? null,
  });

  const useSms = (params.channel === "sms" || normalized.kind === "phone") && Boolean(foundUser.phoneNumber);

  if (useSms && foundUser.phoneNumber) {
    const otp = generateSixDigitOtp();
    await createVerificationRecord(db, {
      identifier: `reset-phone:${foundUser.phoneNumber}`,
      tokenHash: otp.hash,
      ttlSeconds: 60 * 10,
      maxAttempts: 5,
      meta: { userId: foundUser.id },
    });

    await dispatchImmediateAuthNotification({
      type: "auth.otp",
      userId: foundUser.id,
      payload: {
        toPhone: foundUser.phoneNumber,
        code: otp.raw,
        expiresMinutes: 10,
      },
      dedupeKey: `auth.password_reset_otp:${foundUser.id}:${otp.hash.slice(0, 12)}`,
    });
  } else {
    const token = generateSecureToken();
    await createVerificationRecord(db, {
      identifier: `reset-email:${foundUser.id}`,
      tokenHash: token.hash,
      ttlSeconds: 60 * 30,
      maxAttempts: 1,
    });

    const resetUrl = `${env.APP_URL}/reset-password?token=${encodeURIComponent(`${foundUser.id}.${token.raw}`)}`;
    await dispatchImmediateAuthNotification({
      type: "auth.password_reset",
      userId: foundUser.id,
      payload: {
        toEmail: foundUser.email,
        url: resetUrl,
      },
      dedupeKey: `auth.password_reset:${foundUser.id}:${token.hash.slice(0, 12)}`,
    });
  }

  await equaliseTiming(startedAt, 300);
  return {
    ...neutralResponse,
    smsSentFlow: useSms,
  };
}

async function applyPasswordReset(params: {
  userId: string;
  newPassword: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const env = getEnv();
  const db = getDb();

  const policy = await validatePasswordPolicy(params.newPassword, {
    skipHibp: env.INTEGRATIONS_MODE === "fake" || env.NODE_ENV === "test",
  });
  if (!policy.valid) {
    throw new DomainError("VALIDATION_ERROR", policy.reason ?? "Choose a stronger password.", 400);
  }

  const newHash = await hashPassword(params.newPassword);
  const now = new Date();

  const [updatedUser] = await db.transaction(async (tx) => {
    await tx
      .update(account)
      .set({ password: newHash, updatedAt: now })
      .where(and(eq(account.userId, params.userId), eq(account.providerId, "credential")));

    const res = await tx
      .update(userTable)
      .set({ passwordChangedAt: now, updatedAt: now })
      .where(eq(userTable.id, params.userId))
      .returning();

    // Revoke ALL sessions on password reset
    await tx.delete(sessionTable).where(eq(sessionTable.userId, params.userId));

    await recordAuthEvent({
      db: tx,
      userId: params.userId,
      type: "password_reset_completed",
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
    });

    return res;
  });

  if (updatedUser) {
    await dispatchImmediateAuthNotification({
      type: "auth.password_changed",
      userId: updatedUser.id,
      payload: {
        toEmail: updatedUser.email,
        signInUrl: `${env.APP_URL}/sign-in`,
      },
      dedupeKey: `auth.password_changed:${updatedUser.id}:${now.getTime()}`,
    });
  }
}

export async function completePasswordResetByEmailService(params: {
  compositeToken: string;
  password: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const [userId, rawToken] = params.compositeToken.split(".");
  if (!userId || !rawToken) {
    throw new DomainError(
      "VALIDATION_ERROR",
      "Reset link is invalid or expired. Request a new password reset.",
      400,
    );
  }

  const result = await verifyAndConsumeToken({
    identifier: `reset-email:${userId}`,
    rawToken,
  });

  if (!result.ok) {
    throw new DomainError(
      "VALIDATION_ERROR",
      "Reset link is invalid or expired. Request a new password reset.",
      400,
    );
  }

  await applyPasswordReset({
    userId,
    newPassword: params.password,
    ip: params.ip,
    userAgent: params.userAgent,
  });
}

export async function completePasswordResetByPhoneService(params: {
  phone: string;
  code: string;
  password: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  const normalizedPhone = normalizeKenyanPhone(params.phone);
  if (!normalizedPhone) {
    throw new DomainError("VALIDATION_ERROR", "Enter a valid Kenyan mobile number.", 400);
  }

  const result = await verifyAndConsumeToken({
    identifier: `reset-phone:${normalizedPhone}`,
    rawToken: params.code.trim(),
  });

  if (!result.ok || typeof result.meta?.userId !== "string") {
    throw new DomainError(
      "VALIDATION_ERROR",
      "Reset code is invalid or expired. Request a new code.",
      400,
    );
  }

  await applyPasswordReset({
    userId: result.meta.userId,
    newPassword: params.password,
    ip: params.ip,
    userAgent: params.userAgent,
  });
}

export async function updateProfileService(
  actor: Actor,
  input: { fullName: string; locale: "en" },
): Promise<void> {
  authorize(actor, "account:manage_own", { ownerUserId: actor.userId });
  if (!actor.userId) throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);

  await getDb()
    .update(userTable)
    .set({ name: input.fullName.trim(), locale: input.locale, updatedAt: new Date() })
    .where(eq(userTable.id, actor.userId));
}

export async function requestEmailChangeService(
  actor: Actor,
  input: { newEmail: string; currentPassword: string },
): Promise<void> {
  authorize(actor, "account:manage_own", { ownerUserId: actor.userId });
  if (!actor.userId) throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);

  const db = getDb();
  const env = getEnv();
  const cred = await getCredentialAccount(actor.userId);
  const valid = cred?.password
    ? await verifyPassword({ hash: cred.password, password: input.currentPassword })
    : false;
  if (!valid) {
    throw new DomainError("UNAUTHENTICATED", "Current password is incorrect.", 401);
  }

  const normalizedNew = input.newEmail.trim().toLowerCase();
  const [existing] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, normalizedNew))
    .limit(1);
  if (existing) {
    throw new DomainError("CONFLICT", "That email address cannot be used. Try another.", 409);
  }

  const [currentUser] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, actor.userId))
    .limit(1);
  if (!currentUser) throw new DomainError("NOT_FOUND", "Account not found.", 404);

  const token = generateSecureToken();
  await createVerificationRecord(db, {
    identifier: `verify-email:${actor.userId}`,
    tokenHash: token.hash,
    ttlSeconds: 60 * 60 * 24,
    maxAttempts: 1,
    meta: { newEmail: normalizedNew, oldEmail: currentUser.email },
  });

  const verifyUrl = `${env.APP_URL}/verify-email/${encodeURIComponent(`${actor.userId}.${token.raw}`)}?next=${encodeURIComponent("/account/profile")}`;

  await dispatchImmediateAuthNotification({
    type: "auth.verify_email",
    userId: actor.userId,
    payload: { toEmail: normalizedNew, url: verifyUrl },
    dedupeKey: `auth.verify_email_change:${actor.userId}:${token.hash.slice(0, 12)}`,
  });

  await dispatchImmediateAuthNotification({
    type: "auth.email_change_notice",
    userId: actor.userId,
    payload: {
      toEmail: currentUser.email,
      stage: "requested",
      newEmailMasked: maskEmail(normalizedNew),
    },
    dedupeKey: `auth.email_change_req:${actor.userId}:${token.hash.slice(0, 12)}`,
  });
}

export async function requestPhoneChangeService(
  actor: Actor,
  input: { newPhone: string; currentPassword: string },
): Promise<void> {
  authorize(actor, "account:manage_own", { ownerUserId: actor.userId });
  if (!actor.userId) throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);

  const db = getDb();
  const cred = await getCredentialAccount(actor.userId);
  const valid = cred?.password
    ? await verifyPassword({ hash: cred.password, password: input.currentPassword })
    : false;
  if (!valid) {
    throw new DomainError("UNAUTHENTICATED", "Current password is incorrect.", 401);
  }

  const normalizedPhone = normalizeKenyanPhone(input.newPhone);
  if (!normalizedPhone) {
    throw new DomainError("VALIDATION_ERROR", "Enter a valid Kenyan mobile number.", 400);
  }

  const [existing] = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.phoneNumber, normalizedPhone))
    .limit(1);
  if (existing) {
    throw new DomainError(
      "CONFLICT",
      "We could not use this phone number. Try a different one.",
      409,
    );
  }

  await sendPhoneOtpService({
    userId: actor.userId,
    phoneNumber: normalizedPhone,
    ip: actor.ip,
    identifierPrefix: "change-phone",
  });
}

export async function confirmPhoneChangeService(actor: Actor, code: string): Promise<void> {
  authorize(actor, "account:manage_own", { ownerUserId: actor.userId });
  if (!actor.userId) throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);

  const result = await verifyAndConsumeToken({
    identifier: `change-phone:${actor.userId}`,
    rawToken: code.trim(),
  });
  if (!result.ok || typeof result.meta?.phone !== "string") {
    throw new DomainError(
      "VALIDATION_ERROR",
      "Verification code is invalid or expired. Request a new code.",
      400,
    );
  }

  const newPhone = result.meta.phone;
  const db = getDb();
  const [currentUser] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, actor.userId))
    .limit(1);

  const now = new Date();
  await db
    .update(userTable)
    .set({ phoneNumber: newPhone, phoneNumberVerified: true, updatedAt: now })
    .where(eq(userTable.id, actor.userId));

  await recordAuthEvent({
    db,
    userId: actor.userId,
    type: "phone_changed",
    identifierHash: hmacHash(newPhone),
    ip: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
  });

  if (currentUser?.phoneNumber) {
    await dispatchImmediateAuthNotification({
      type: "auth.phone_change_notice",
      userId: actor.userId,
      payload: { toPhone: currentUser.phoneNumber },
      dedupeKey: `auth.phone_change_notice:${actor.userId}:${now.getTime()}`,
    });
  }
}

export async function changePasswordService(
  actor: Actor,
  currentSessionId: string,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  authorize(actor, "account:manage_own", { ownerUserId: actor.userId });
  if (!actor.userId) throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);

  const db = getDb();
  const env = getEnv();
  const cred = await getCredentialAccount(actor.userId);
  const valid = cred?.password
    ? await verifyPassword({ hash: cred.password, password: input.currentPassword })
    : false;
  if (!valid) {
    throw new DomainError("UNAUTHENTICATED", "Current password is incorrect.", 401);
  }

  const policy = await validatePasswordPolicy(input.newPassword, {
    skipHibp: env.INTEGRATIONS_MODE === "fake" || env.NODE_ENV === "test",
  });
  if (!policy.valid) {
    throw new DomainError("VALIDATION_ERROR", policy.reason ?? "Choose a stronger password.", 400);
  }

  const newHash = await hashPassword(input.newPassword);
  const now = new Date();

  const [updatedUser] = await db.transaction(async (tx) => {
    await tx
      .update(account)
      .set({ password: newHash, updatedAt: now })
      .where(and(eq(account.userId, actor.userId!), eq(account.providerId, "credential")));

    const res = await tx
      .update(userTable)
      .set({ passwordChangedAt: now, updatedAt: now })
      .where(eq(userTable.id, actor.userId!))
      .returning();

    // Revoke all other sessions
    await tx
      .delete(sessionTable)
      .where(and(eq(sessionTable.userId, actor.userId!), ne(sessionTable.id, currentSessionId)));

    await recordAuthEvent({
      db: tx,
      userId: actor.userId,
      type: "password_changed",
      ip: actor.ip ?? null,
      userAgent: actor.userAgent ?? null,
    });

    return res;
  });

  if (updatedUser) {
    await dispatchImmediateAuthNotification({
      type: "auth.password_changed",
      userId: updatedUser.id,
      payload: {
        toEmail: updatedUser.email,
        signInUrl: `${env.APP_URL}/sign-in`,
      },
      dedupeKey: `auth.password_changed:${updatedUser.id}:${now.getTime()}`,
    });
  }
}

export async function listActiveSessionsService(actor: Actor, currentSessionId: string) {
  authorize(actor, "account:manage_own", { ownerUserId: actor.userId });
  if (!actor.userId) return [];

  const rows = await getDb()
    .select()
    .from(sessionTable)
    .where(and(eq(sessionTable.userId, actor.userId), gt(sessionTable.expiresAt, new Date())))
    .orderBy(desc(sessionTable.lastActiveAt));

  return rows.map((row) => ({
    id: row.id,
    ipAddress: row.ipAddress ?? "Unknown",
    userAgent: row.userAgent ?? "Unknown device",
    lastActiveAt: row.lastActiveAt,
    createdAt: row.createdAt,
    isCurrent: row.id === currentSessionId,
  }));
}

export async function revokeSessionService(actor: Actor, sessionIdToRevoke: string): Promise<void> {
  authorize(actor, "account:manage_own", { ownerUserId: actor.userId });
  if (!actor.userId) return;

  const db = getDb();
  await db
    .delete(sessionTable)
    .where(and(eq(sessionTable.id, sessionIdToRevoke), eq(sessionTable.userId, actor.userId)));

  await recordAuthEvent({
    db,
    userId: actor.userId,
    type: "session_revoked",
    ip: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
    meta: { sessionId: sessionIdToRevoke },
  });
}

export async function revokeOtherSessionsService(
  actor: Actor,
  currentSessionId: string,
): Promise<void> {
  authorize(actor, "account:manage_own", { ownerUserId: actor.userId });
  if (!actor.userId) return;

  const db = getDb();
  await db
    .delete(sessionTable)
    .where(and(eq(sessionTable.userId, actor.userId), ne(sessionTable.id, currentSessionId)));

  await recordAuthEvent({
    db,
    userId: actor.userId,
    type: "session_revoked",
    ip: actor.ip ?? null,
    userAgent: actor.userAgent ?? null,
    meta: { scope: "all_other" },
  });
}

export async function requestDataExportService(actor: Actor): Promise<void> {
  authorize(actor, "account:manage_own", { ownerUserId: actor.userId });
  if (!actor.userId) throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);

  const db = getDb();
  const [req] = await db
    .insert(privacyRequests)
    .values({
      userId: actor.userId,
      type: "export",
      status: "pending",
    })
    .returning();

  if (req) {
    await audit({
      db,
      actor,
      action: "privacy.export_requested",
      entityType: "privacy_request",
      entityId: req.id,
    });
  }
}

export async function requestAccountDeletionService(
  actor: Actor,
  reason?: string,
): Promise<void> {
  authorize(actor, "account:manage_own", { ownerUserId: actor.userId });
  if (!actor.userId || !actor.customerId) {
    throw new DomainError("FORBIDDEN", "Only customer accounts can request self-deletion.", 403);
  }

  const db = getDb();
  const openApps = await db
    .select({ id: applications.id, status: applications.status })
    .from(applications)
    .where(
      and(
        eq(applications.customerId, actor.customerId),
        notInArray(applications.status, [...TERMINAL_APPLICATION_STATUSES]),
      ),
    )
    .limit(1);

  if (openApps.length > 0) {
    throw new DomainError(
      "CONFLICT",
      "Account deletion is only available after all active applications are settled or closed.",
      409,
    );
  }

  const [req] = await db
    .insert(privacyRequests)
    .values({
      userId: actor.userId,
      type: "delete",
      status: "pending",
      reason: reason ?? null,
    })
    .returning();

  if (req) {
    await audit({
      db,
      actor,
      action: "privacy.deletion_requested",
      entityType: "privacy_request",
      entityId: req.id,
    });
  }
}

export async function createInvitationService(
  actor: Actor,
  input: {
    email: string;
    kind: "staff" | "lender";
    staffRoles?: StaffRole[];
    lenderId?: string;
    lenderRole?: LenderRole;
  },
): Promise<{ invitationId: string; inviteUrl: string }> {
  authorize(actor, "admin:manage_users");
  if (!actor.userId) throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);

  const db = getDb();
  const env = getEnv();
  const normalizedEmail = input.email.trim().toLowerCase();
  const token = generateSecureToken();
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

  const [inv] = await db
    .insert(invitations)
    .values({
      email: normalizedEmail,
      kind: input.kind,
      staffRoles: input.kind === "staff" ? (input.staffRoles ?? []) : null,
      lenderId: input.kind === "lender" ? (input.lenderId ?? null) : null,
      lenderRole: input.kind === "lender" ? (input.lenderRole ?? "viewer") : null,
      tokenHash: token.hash,
      expiresAt,
      invitedBy: actor.userId,
    })
    .returning();

  const inviteUrl = `${env.APP_URL}/accept-invite/${encodeURIComponent(token.raw)}`;
  const roleLabel =
    input.kind === "staff"
      ? (input.staffRoles ?? []).join(", ")
      : `Lender (${input.lenderRole ?? "viewer"})`;

  await audit({
    db,
    actor,
    action: "invitation.created",
    entityType: "invitation",
    entityId: inv.id,
    meta: { kind: input.kind, roleLabel },
  });

  await dispatchImmediateAuthNotification({
    type: "auth.invite",
    payload: {
      toEmail: normalizedEmail,
      inviteUrl,
      roleLabel,
    },
    dedupeKey: `auth.invite:${inv.id}`,
  });

  return { invitationId: inv.id, inviteUrl };
}

export async function acceptInvitationService(params: {
  rawToken: string;
  fullName: string;
  password: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ userId: string; kind: "staff" | "lender" }> {
  const db = getDb();
  const env = getEnv();
  const tokenHash = sha256Hex(params.rawToken);
  const now = new Date();

  const [inv] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.tokenHash, tokenHash), gt(invitations.expiresAt, now)))
    .limit(1);

  if (!inv || inv.acceptedAt || (inv.kind !== "staff" && inv.kind !== "lender")) {
    throw new DomainError(
      "VALIDATION_ERROR",
      "Invitation link is invalid or expired. Ask an administrator for a new invite.",
      400,
    );
  }

  const policy = await validatePasswordPolicy(params.password, {
    skipHibp: env.INTEGRATIONS_MODE === "fake" || env.NODE_ENV === "test",
  });
  if (!policy.valid) {
    throw new DomainError("VALIDATION_ERROR", policy.reason ?? "Choose a stronger password.", 400);
  }

  const passwordHash = await hashPassword(params.password);
  const userId = uuidv7();

  await db.transaction(async (tx) => {
    await tx.insert(userTable).values({
      id: userId,
      name: params.fullName.trim(),
      email: inv.email.toLowerCase(),
      emailVerified: true,
      phoneNumberVerified: false,
      twoFactorEnabled: false,
      kind: inv.kind,
      status: "active",
      locale: "en",
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: now,
    });

    await tx.insert(account).values({
      id: uuidv7(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
    });

    if (inv.kind === "staff") {
      await tx.insert(staffProfiles).values({
        userId,
        roles: inv.staffRoles ?? ["ops_reviewer"],
        active: true,
      });
    } else if (inv.kind === "lender" && inv.lenderId) {
      await tx.insert(lenderUsers).values({
        userId,
        lenderId: inv.lenderId,
        role: inv.lenderRole ?? "viewer",
      });
    }

    await tx
      .update(invitations)
      .set({ acceptedAt: now, updatedAt: now })
      .where(eq(invitations.id, inv.id));

    await recordAuthEvent({
      db: tx,
      userId,
      type: "sign_up",
      identifierHash: hmacHash(inv.email),
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
      meta: { viaInvitation: inv.id },
    });
  });

  await getAuth().api.signInEmail({
    body: {
      email: inv.email.toLowerCase(),
      password: params.password,
      rememberMe: false,
    },
    headers: await headers(),
  });

  return { userId, kind: inv.kind };
}

export async function markSessionMfaVerified(sessionId: string, userId: string, ip?: string | null, userAgent?: string | null): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db
    .update(sessionTable)
    .set({ mfaVerifiedAt: now, stepUpVerifiedAt: now, updatedAt: now })
    .where(eq(sessionTable.id, sessionId));

  await recordAuthEvent({
    db,
    userId,
    type: "mfa_enrolled",
    ip: ip ?? null,
    userAgent: userAgent ?? null,
  });
}

export async function confirmMfaResetService(
  actor: Actor,
  resetRequestId: string,
): Promise<void> {
  authorize(actor, "admin:manage_users");
  if (!actor.userId) throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);

  const db = getDb();
  const env = getEnv();
  const [req] = await db
    .select()
    .from(mfaResetRequests)
    .where(eq(mfaResetRequests.id, resetRequestId))
    .limit(1);

  if (!req || req.status !== "pending") {
    throw new DomainError("NOT_FOUND", "Pending MFA reset request not found.", 404);
  }
  if (req.requestedBy === actor.userId) {
    throw new DomainError(
      "FORBIDDEN",
      "A second administrator must confirm this MFA reset.",
      403,
    );
  }

  const now = new Date();
  const [targetUser] = await db.transaction(async (tx) => {
    await tx.delete(twoFactor).where(eq(twoFactor.userId, req.targetUserId));
    await tx.delete(sessionTable).where(eq(sessionTable.userId, req.targetUserId));

    const updatedUsers = await tx
      .update(userTable)
      .set({ twoFactorEnabled: false, updatedAt: now })
      .where(eq(userTable.id, req.targetUserId))
      .returning();

    await tx
      .update(mfaResetRequests)
      .set({
        status: "confirmed",
        confirmedBy: actor.userId,
        confirmedAt: now,
        updatedAt: now,
      })
      .where(eq(mfaResetRequests.id, req.id));

    await audit({
      db: tx,
      actor,
      action: "user.mfa_reset_confirmed",
      entityType: "user",
      entityId: req.targetUserId,
      meta: { resetRequestId: req.id, requestedBy: req.requestedBy },
    });

    await recordAuthEvent({
      db: tx,
      userId: req.targetUserId,
      type: "mfa_reset",
      ip: actor.ip ?? null,
      userAgent: actor.userAgent ?? null,
    });

    return updatedUsers;
  });

  if (targetUser) {
    await dispatchImmediateAuthNotification({
      type: "auth.mfa_reset",
      userId: targetUser.id,
      payload: {
        toEmail: targetUser.email,
        signInUrl: `${env.APP_URL}/sign-in`,
      },
      dedupeKey: `auth.mfa_reset:${req.id}`,
    });
  }
}

export async function suspendUserService(actor: Actor, targetUserId: string): Promise<void> {
  authorize(actor, "admin:manage_users");
  const db = getDb();
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(userTable)
      .set({ status: "suspended", updatedAt: now })
      .where(eq(userTable.id, targetUserId));
    await tx.delete(sessionTable).where(eq(sessionTable.userId, targetUserId));
    await audit({
      db: tx,
      actor,
      action: "user.suspended",
      entityType: "user",
      entityId: targetUserId,
    });
  });
}

export async function verifyStepUpPasswordService(
  actor: Actor,
  sessionId: string,
  password: string,
): Promise<void> {
  if (!actor.userId) throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);
  const cred = await getCredentialAccount(actor.userId);
  const valid = cred?.password
    ? await verifyPassword({ hash: cred.password, password })
    : false;
  if (!valid) {
    throw new DomainError("UNAUTHENTICATED", "Password is incorrect.", 401);
  }
  await getDb()
    .update(sessionTable)
    .set({ stepUpVerifiedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(sessionTable.id, sessionId), eq(sessionTable.userId, actor.userId)));
}

export async function getUserConsentsHistory(customerId: string) {
  const db = getDb();
  return db.query.consents.findMany({
    where: (c, { eq: eqOp }) => eqOp(c.customerId, customerId),
    orderBy: (c, { desc: descOp }) => [descOp(c.acceptedAt)],
  });
}

export async function getCustomerVerificationBannerState(userId: string) {
  const [row] = await getDb()
    .select({
      emailVerified: userTable.emailVerified,
      phoneNumberVerified: userTable.phoneNumberVerified,
    })
    .from(userTable)
    .where(inArray(userTable.id, [userId]))
    .limit(1);
  return row ?? { emailVerified: false, phoneNumberVerified: false };
}
