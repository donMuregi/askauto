import { describe, expect, it } from "vitest";
import { validateHandoverReadiness } from "@/server/domain/garage/service";

describe("validateHandoverReadiness", () => {
  it("passes when all scope lines are completed and mileage out >= mileage in", () => {
    expect(
      validateHandoverReadiness({
        totalLines: 3,
        completedLines: 3,
        mileageIn: 145000,
        mileageOut: 145008,
      }),
    ).toEqual({ ok: true });
  });

  it("blocks handover when approved repair lines remain incomplete", () => {
    const res = validateHandoverReadiness({
      totalLines: 3,
      completedLines: 2,
      mileageIn: 145000,
      mileageOut: 145005,
    });
    expect(res.ok).toBe(false);
  });

  it("blocks handover when mileage out is below mileage in", () => {
    const res = validateHandoverReadiness({
      totalLines: 2,
      completedLines: 2,
      mileageIn: 145000,
      mileageOut: 144990,
    });
    expect(res.ok).toBe(false);
  });

  it("blocks handover when mileage out is zero or negative", () => {
    const res = validateHandoverReadiness({
      totalLines: 1,
      completedLines: 1,
      mileageIn: null,
      mileageOut: 0,
    });
    expect(res.ok).toBe(false);
  });
});
