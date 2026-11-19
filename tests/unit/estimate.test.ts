import { describe, expect, it } from "vitest";
import { estimateDailyRepayment } from "@/server/domain/applications/estimate";

describe("estimateDailyRepayment()", () => {
  it("computes the default placeholder daily estimate (KES 424/day) with indicative label", () => {
    const res = estimateDailyRepayment();
    expect(res.financedAmountKes).toBe(20000);
    expect(res.dailyRepaymentKes).toBe(424);
    expect(res.indicativeLabel).toContain("Indicative only");
  });

  it("reduces financed amount when an optional deposit is entered", () => {
    const res = estimateDailyRepayment({ repairEstimateKes: 20000, depositKes: 5000 });
    expect(res.financedAmountKes).toBe(15000);
    expect(res.dailyRepaymentKes).toBe(318);
  });

  it("clamps financed amount to zero when deposit exceeds repair estimate", () => {
    const res = estimateDailyRepayment({ repairEstimateKes: 10000, depositKes: 15000 });
    expect(res.financedAmountKes).toBe(0);
    expect(res.dailyRepaymentKes).toBe(0);
  });
});
