import { describe, expect, it } from "vitest";
import { validateLenderOfferTerms } from "@/server/domain/lenders/service";

describe("validateLenderOfferTerms", () => {
  const now = new Date("2026-11-20T10:00:00.000Z");
  const validUntil = new Date("2026-11-27T10:00:00.000Z");

  it("accepts a valid daily offer for RIDE_HAILING", () => {
    const res = validateLenderOfferTerms({
      productCode: "RIDE_HAILING",
      approvedAmountKes: 25000,
      installmentKes: 1000,
      frequency: "daily",
      tenorCount: 30,
      validUntil,
      now,
    });
    expect(res).toEqual({ ok: true, totalPayableKes: 30000 });
  });

  it("accepts a valid monthly offer for SALARIED", () => {
    const res = validateLenderOfferTerms({
      productCode: "SALARIED",
      approvedAmountKes: 45000,
      installmentKes: 16500,
      frequency: "monthly",
      tenorCount: 3,
      validUntil,
      now,
    });
    expect(res).toEqual({ ok: true, totalPayableKes: 49500 });
  });

  it("rejects monthly frequency on RIDE_HAILING (R5)", () => {
    const res = validateLenderOfferTerms({
      productCode: "RIDE_HAILING",
      approvedAmountKes: 25000,
      installmentKes: 10000,
      frequency: "monthly",
      tenorCount: 3,
      validUntil,
      now,
    });
    expect(res.ok).toBe(false);
  });

  it("rejects daily frequency on SALARIED (R5)", () => {
    const res = validateLenderOfferTerms({
      productCode: "SALARIED",
      approvedAmountKes: 25000,
      installmentKes: 1000,
      frequency: "daily",
      tenorCount: 30,
      validUntil,
      now,
    });
    expect(res.ok).toBe(false);
  });

  it("rejects total payable below approved amount", () => {
    const res = validateLenderOfferTerms({
      productCode: "RIDE_HAILING",
      approvedAmountKes: 30000,
      installmentKes: 900,
      frequency: "daily",
      tenorCount: 30,
      validUntil,
      now,
    });
    expect(res.ok).toBe(false);
  });

  it("rejects past or immediate validUntil", () => {
    const res = validateLenderOfferTerms({
      productCode: "RIDE_HAILING",
      approvedAmountKes: 20000,
      installmentKes: 1000,
      frequency: "daily",
      tenorCount: 25,
      validUntil: new Date("2026-11-19T10:00:00.000Z"),
      now,
    });
    expect(res.ok).toBe(false);
  });

  it("rejects non-positive amounts or tenor", () => {
    const res = validateLenderOfferTerms({
      productCode: "SALARIED",
      approvedAmountKes: 0,
      installmentKes: 5000,
      frequency: "monthly",
      tenorCount: 3,
      validUntil,
      now,
    });
    expect(res.ok).toBe(false);
  });
});
