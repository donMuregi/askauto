import { describe, expect, it } from "vitest";
import {
  computeNextRetryAt,
  EVENT_RULES,
  formatSmsMessage,
  isInQuietHoursEat,
  nextQuietHoursEndUtc,
} from "@/server/domain/notifications/rules";

describe("notification rules", () => {
  it("detects EAT quiet hours (21:00 to 07:00 EAT)", () => {
    // 19:30 UTC = 22:30 EAT (quiet)
    expect(isInQuietHoursEat(new Date("2026-11-19T19:30:00.000Z"))).toBe(true);
    // 03:30 UTC = 06:30 EAT (quiet)
    expect(isInQuietHoursEat(new Date("2026-11-19T03:30:00.000Z"))).toBe(true);
    // 04:05 UTC = 07:05 EAT (awake)
    expect(isInQuietHoursEat(new Date("2026-11-19T04:05:00.000Z"))).toBe(false);
    // 17:59 UTC = 20:59 EAT (awake)
    expect(isInQuietHoursEat(new Date("2026-11-19T17:59:00.000Z"))).toBe(false);
  });

  it("computes next 07:00 EAT boundary in UTC", () => {
    const night = new Date("2026-11-19T19:30:00.000Z"); // 22:30 EAT
    const end = nextQuietHoursEndUtc(night);
    expect(end.toISOString()).toBe("2026-11-20T04:00:00.000Z"); // 07:00 EAT next day

    const earlyMorning = new Date("2026-11-19T02:00:00.000Z"); // 05:00 EAT
    const sameDayEnd = nextQuietHoursEndUtc(earlyMorning);
    expect(sameDayEnd.toISOString()).toBe("2026-11-19T04:00:00.000Z"); // 07:00 EAT same day
  });

  it("applies exact retry backoff schedule [1m, 5m, 30m, 2h, 6h] and stops after 5 attempts", () => {
    const base = new Date("2026-11-19T10:00:00.000Z");
    expect(computeNextRetryAt(0, base)?.toISOString()).toBe("2026-11-19T10:01:00.000Z");
    expect(computeNextRetryAt(1, base)?.toISOString()).toBe("2026-11-19T10:05:00.000Z");
    expect(computeNextRetryAt(2, base)?.toISOString()).toBe("2026-11-19T10:30:00.000Z");
    expect(computeNextRetryAt(3, base)?.toISOString()).toBe("2026-11-19T12:00:00.000Z");
    expect(computeNextRetryAt(4, base)?.toISOString()).toBe("2026-11-19T16:00:00.000Z");
    expect(computeNextRetryAt(5, base)).toBeNull();
  });

  it("formats OTP SMS under 160 chars with no links", () => {
    const msg = formatSmsMessage("auth.otp", { code: "482915", expiresMinutes: 5 });
    expect(msg).toBe("Your Ask AutoParts code is 482915. It expires in 5 minutes. Do not share it.");
    expect(msg.length).toBeLessThan(160);
    expect(msg).not.toContain("http");
  });

  it("ensures OTP and payment receipts bypass quiet hours", () => {
    expect(EVENT_RULES["auth.otp"].bypassQuietHours).toBe(true);
    expect(EVENT_RULES["fee.paid"].bypassQuietHours).toBe(true);
    expect(EVENT_RULES["reminder.repayment"].bypassQuietHours).toBe(false);
  });
});
