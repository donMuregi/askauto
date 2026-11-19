import { describe, expect, it } from "vitest";
import { formatKenyanDate, formatKenyanDateTime, formatKes } from "@/lib/format";

describe("Kenyan formatting helpers", () => {
  it("formats whole KES currency without decimals", () => {
    expect(formatKes(70000)).toBe("KES 70,000");
    expect(formatKes(1500)).toBe("KES 1,500");
    expect(formatKes(0)).toBe("KES 0");
  });

  it("formats dates and times in Africa/Nairobi (EAT)", () => {
    const utcDate = new Date("2026-11-03T09:30:00.000Z");
    expect(formatKenyanDate(utcDate)).toBe("3 November 2026");
    expect(formatKenyanDateTime(utcDate)).toBe("3 November 2026, 12:30 EAT");
  });
});
