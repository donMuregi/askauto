import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getEnv } from "./env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function deriveKey(rawKey?: string): Buffer {
  const keyStr = rawKey ?? getEnv().FIELD_ENCRYPTION_KEY;
  const decoded = Buffer.from(keyStr, "base64");
  if (decoded.length === 32) {
    return decoded;
  }
  return createHash("sha256").update(keyStr, "utf8").digest();
}

export function encryptField(plaintext: string, rawKey?: string): Buffer {
  const key = deriveKey(rawKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

export function decryptField(payload: Buffer, rawKey?: string): string {
  const key = deriveKey(rawKey);
  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function hmacHash(value: string, rawKey?: string): string {
  const key = deriveKey(rawKey);
  return createHmac("sha256", key).update(value.trim().toLowerCase(), "utf8").digest("hex");
}

export function sha256Hex(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function maskNationalId(nationalId: string): string {
  const trimmed = nationalId.trim();
  if (trimmed.length <= 3) {
    return "***";
  }
  return `${"*".repeat(Math.max(trimmed.length - 3, 4))}${trimmed.slice(-3)}`;
}

export function maskPhoneLast3(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 3) return "***";
  return `***${digits.slice(-3)}`;
}
