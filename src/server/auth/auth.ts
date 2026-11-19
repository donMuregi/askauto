import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { phoneNumber, twoFactor } from "better-auth/plugins";
import { uuidv7 } from "uuidv7";
import { BRAND_NAME } from "@/lib/constants";
import { getEnv } from "@/lib/env";
import { normalizeKenyanPhone } from "@/lib/phone";
import { getDb } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { dispatchImmediateAuthNotification } from "@/server/domain/notifications/outbox";

function createAuth() {
  const env = getEnv();

  return betterAuth({
    appName: BRAND_NAME,
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        twoFactor: schema.twoFactor,
        rateLimit: schema.rateLimit,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      maxPasswordLength: 128,
      requireEmailVerification: false,
      resetPasswordTokenExpiresIn: 60 * 30,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await dispatchImmediateAuthNotification({
          type: "auth.password_reset",
          userId: user.id,
          payload: {
            toEmail: user.email,
            url,
          },
          dedupeKey: `auth.password_reset:${user.id}:${uuidv7()}`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: false,
      expiresIn: 60 * 60 * 24,
      sendVerificationEmail: async ({ user, url }) => {
        await dispatchImmediateAuthNotification({
          type: "auth.verify_email",
          userId: user.id,
          payload: {
            toEmail: user.email,
            url,
          },
          dedupeKey: `auth.verify_email:${user.id}:${uuidv7()}`,
        });
      },
    },
    user: {
      additionalFields: {
        kind: {
          type: "string",
          required: false,
          defaultValue: "customer",
          input: false,
        },
        status: {
          type: "string",
          required: false,
          defaultValue: "active",
          input: false,
        },
        locale: {
          type: "string",
          required: false,
          defaultValue: "en",
        },
        termsVersion: {
          type: "string",
          required: false,
        },
        termsAcceptedAt: {
          type: "date",
          required: false,
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: false,
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
    },
    advanced: {
      useSecureCookies: env.NODE_ENV === "production",
      cookiePrefix: "fnpl",
      database: {
        generateId: () => uuidv7(),
      },
    },
    plugins: [
      phoneNumber({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        phoneNumberValidator: (phone) => normalizeKenyanPhone(phone) !== null,
        sendOTP: async ({ phoneNumber: phone, code }) => {
          await dispatchImmediateAuthNotification({
            type: "auth.otp",
            payload: {
              toPhone: phone,
              code,
              expiresMinutes: 5,
            },
            dedupeKey: `auth.otp:${phone}:${uuidv7()}`,
          });
        },
        sendPasswordResetOTP: async ({ phoneNumber: phone, code }) => {
          await dispatchImmediateAuthNotification({
            type: "auth.otp",
            payload: {
              toPhone: phone,
              code,
              expiresMinutes: 10,
            },
            dedupeKey: `auth.password_reset_otp:${phone}:${uuidv7()}`,
          });
        },
      }),
      twoFactor({
        issuer: BRAND_NAME,
        accountLockout: {
          enabled: true,
          maxFailedAttempts: 5,
          durationSeconds: 900,
        },
      }),
      nextCookies(),
    ],
  });
}

type GlobalWithAuth = typeof globalThis & {
  __fnplAuth?: ReturnType<typeof createAuth>;
};

const globalForAuth = globalThis as GlobalWithAuth;

export function getAuth() {
  if (!globalForAuth.__fnplAuth) {
    globalForAuth.__fnplAuth = createAuth();
  }
  return globalForAuth.__fnplAuth;
}

export const auth = new Proxy({} as ReturnType<typeof createAuth>, {
  get(_target, prop, receiver) {
    const instance = getAuth();
    return Reflect.get(instance, prop, receiver);
  },
});
