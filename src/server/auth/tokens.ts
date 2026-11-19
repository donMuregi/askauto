import { randomBytes, randomInt } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { sha256Hex, timingSafeEqualHex } from "@/lib/crypto";
import { getDb, type DbOrTx } from "@/server/db/client";
import { verification } from "@/server/db/schema";

export function generateSecureToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: sha256Hex(raw) };
}

export function generateSixDigitOtp(): { raw: string; hash: string } {
  const raw = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return { raw, hash: sha256Hex(raw) };
}

export interface StoredVerificationPayload {
  hash: string;
  attempts: number;
  maxAttempts: number;
  meta?: Record<string, unknown>;
}

export async function createVerificationRecord(
  db: DbOrTx,
  params: {
    identifier: string;
    tokenHash: string;
    ttlSeconds: number;
    maxAttempts?: number;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  // Single-use: replace any existing active record for this identifier
  await db.delete(verification).where(eq(verification.identifier, params.identifier));

  const payload: StoredVerificationPayload = {
    hash: params.tokenHash,
    attempts: 0,
    maxAttempts: params.maxAttempts ?? 1,
    meta: params.meta,
  };

  await db.insert(verification).values({
    identifier: params.identifier,
    value: JSON.stringify(payload),
    expiresAt: new Date(Date.now() + params.ttlSeconds * 1000),
  });
}

export async function verifyAndConsumeToken(params: {
  identifier: string;
  rawToken: string;
}): Promise<
  | { ok: true; meta?: Record<string, unknown> }
  | { ok: false; reason: "not_found" | "expired" | "max_attempts" | "mismatch" }
> {
  const db = getDb();
  const now = new Date();
  const [record] = await db
    .select()
    .from(verification)
    .where(and(eq(verification.identifier, params.identifier), gt(verification.expiresAt, now)))
    .limit(1);

  if (!record) {
    return { ok: false, reason: "not_found" };
  }

  let parsed: StoredVerificationPayload;
  try {
    parsed = JSON.parse(record.value) as StoredVerificationPayload;
  } catch {
    return { ok: false, reason: "not_found" };
  }

  if (parsed.attempts >= parsed.maxAttempts) {
    await db.delete(verification).where(eq(verification.id, record.id));
    return { ok: false, reason: "max_attempts" };
  }

  const candidateHash = sha256Hex(params.rawToken);
  if (timingSafeEqualHex(candidateHash, parsed.hash)) {
    await db.delete(verification).where(eq(verification.id, record.id));
    return { ok: true, meta: parsed.meta };
  }

  const nextAttempts = parsed.attempts + 1;
  if (nextAttempts >= parsed.maxAttempts) {
    await db.delete(verification).where(eq(verification.id, record.id));
    return { ok: false, reason: "max_attempts" };
  }

  await db
    .update(verification)
    .set({
      value: JSON.stringify({ ...parsed, attempts: nextAttempts }),
      updatedAt: now,
    })
    .where(eq(verification.id, record.id));

  return { ok: false, reason: "mismatch" };
}

export async function equaliseTiming(startedAtMs: number, targetMs = 250): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  const elapsed = Date.now() - startedAtMs;
  const remaining = targetMs - elapsed;
  if (remaining > 0) {
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
}
