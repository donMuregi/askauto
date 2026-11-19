import pino from "pino";
import { uuidv7 } from "uuidv7";

const REDACT_PATHS = [
  "password",
  "*.password",
  "newPassword",
  "*.newPassword",
  "currentPassword",
  "*.currentPassword",
  "token",
  "*.token",
  "otp",
  "*.otp",
  "code",
  "*.code",
  "resetUrl",
  "*.resetUrl",
  "nationalId",
  "*.nationalId",
  "national_id",
  "*.national_id",
  "email",
  "*.email",
  "phone",
  "*.phone",
  "phoneNumber",
  "*.phoneNumber",
  "msisdn",
  "*.msisdn",
  "authorization",
  "*.authorization",
  "cookie",
  "*.cookie",
  "headers.authorization",
  "headers.cookie",
  "req.headers.authorization",
  "req.headers.cookie",
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  redact: {
    paths: REDACT_PATHS,
    censor: "[REDACTED]",
  },
  base: {
    service: "fnpl-platform",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function createRequestId(existing?: string | null): string {
  if (existing && existing.length <= 128 && /^[a-zA-Z0-9_-]+$/.test(existing)) {
    return existing;
  }
  return uuidv7();
}

export function createRequestLogger(requestId?: string | null) {
  return logger.child({ requestId: createRequestId(requestId) });
}
