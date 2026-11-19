import { describe, expect, it } from "vitest";
import { isSessionExpiredByPolicy } from "@/server/auth/guards";

describe("session lifetime and idle policy", () => {
  const base = new Date("2026-11-19T08:00:00.000Z");

  it("enforces staff 12h absolute and 30m idle limits", () => {
    expect(
      isSessionExpiredByPolicy({
        kind: "staff",
        createdAt: base,
        lastActiveAt: new Date(base.getTime() + 20 * 60_000),
        now: new Date(base.getTime() + 45 * 60_000),
      }),
    ).toBe(false);

    // 31 minutes idle -> expired
    expect(
      isSessionExpiredByPolicy({
        kind: "staff",
        createdAt: base,
        lastActiveAt: base,
        now: new Date(base.getTime() + 31 * 60_000),
      }),
    ).toBe(true);

    // 13 hours absolute even if recently active -> expired
    expect(
      isSessionExpiredByPolicy({
        kind: "staff",
        createdAt: base,
        lastActiveAt: new Date(base.getTime() + 12.9 * 3600_000),
        now: new Date(base.getTime() + 13 * 3600_000),
      }),
    ).toBe(true);
  });

  it("enforces lender 8h absolute and 30m idle limits", () => {
    expect(
      isSessionExpiredByPolicy({
        kind: "lender",
        createdAt: base,
        lastActiveAt: new Date(base.getTime() + 8 * 3600_000),
        now: new Date(base.getTime() + 8.1 * 3600_000),
      }),
    ).toBe(true);
  });

  it("enforces customer 30d rolling and 90d absolute limits", () => {
    const day = 24 * 3600_000;
    expect(
      isSessionExpiredByPolicy({
        kind: "customer",
        createdAt: base,
        lastActiveAt: new Date(base.getTime() + 25 * day),
        now: new Date(base.getTime() + 50 * day),
      }),
    ).toBe(false);

    expect(
      isSessionExpiredByPolicy({
        kind: "customer",
        createdAt: base,
        lastActiveAt: new Date(base.getTime() + 89 * day),
        now: new Date(base.getTime() + 91 * day),
      }),
    ).toBe(true);
  });
});
