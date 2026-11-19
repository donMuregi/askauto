import { eq } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { rateLimit } from "@/server/db/schema";

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
}

export async function checkAndIncrementRateLimit(params: {
  key: string;
  maxRequests: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const db = getDb();
  const nowMs = Date.now();
  const windowMs = params.windowSeconds * 1000;

  const [existing] = await db
    .select()
    .from(rateLimit)
    .where(eq(rateLimit.key, params.key))
    .limit(1);

  if (!existing || nowMs - existing.lastRequest >= windowMs) {
    await db
      .insert(rateLimit)
      .values({
        key: params.key,
        count: 1,
        lastRequest: nowMs,
      })
      .onConflictDoUpdate({
        target: rateLimit.key,
        set: { count: 1, lastRequest: nowMs },
      });
    return { allowed: true, count: 1, retryAfterSeconds: 0 };
  }

  const nextCount = existing.count + 1;
  const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (nowMs - existing.lastRequest)) / 1000));

  if (existing.count >= params.maxRequests) {
    return {
      allowed: false,
      count: existing.count,
      retryAfterSeconds,
    };
  }

  await db
    .update(rateLimit)
    .set({ count: nextCount })
    .where(eq(rateLimit.key, params.key));

  return { allowed: true, count: nextCount, retryAfterSeconds: 0 };
}

export async function getRateLimitState(params: {
  key: string;
  windowSeconds: number;
}): Promise<{ count: number; retryAfterSeconds: number }> {
  const db = getDb();
  const nowMs = Date.now();
  const windowMs = params.windowSeconds * 1000;

  const [existing] = await db
    .select()
    .from(rateLimit)
    .where(eq(rateLimit.key, params.key))
    .limit(1);

  if (!existing || nowMs - existing.lastRequest >= windowMs) {
    return { count: 0, retryAfterSeconds: 0 };
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowMs - (nowMs - existing.lastRequest)) / 1000),
  );
  return { count: existing.count, retryAfterSeconds };
}

export async function resetRateLimit(key: string): Promise<void> {
  await getDb().delete(rateLimit).where(eq(rateLimit.key, key));
}
