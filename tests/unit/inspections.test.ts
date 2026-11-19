import { describe, expect, it } from "vitest";
import {
  calculateScopeTotals,
  deriveAssessmentState,
} from "@/server/domain/inspections/service";

describe("assessor inspection & scope logic", () => {
  it("distinguishes new, draft, returned, submitted, scope_sent, and approved states", () => {
    expect(
      deriveAssessmentState({
        applicationStatus: "BOOKED",
        inspectionStatus: null,
        returnNotes: null,
        scopeStatus: null,
      }),
    ).toBe("new");

    expect(
      deriveAssessmentState({
        applicationStatus: "BOOKED",
        inspectionStatus: "draft",
        returnNotes: null,
        scopeStatus: null,
      }),
    ).toBe("draft");

    expect(
      deriveAssessmentState({
        applicationStatus: "BOOKED",
        inspectionStatus: "draft",
        returnNotes: "Add rear photo",
        scopeStatus: null,
      }),
    ).toBe("returned");

    expect(
      deriveAssessmentState({
        applicationStatus: "REPORT_SUBMITTED",
        inspectionStatus: "submitted",
        returnNotes: null,
        scopeStatus: null,
      }),
    ).toBe("submitted");

    expect(
      deriveAssessmentState({
        applicationStatus: "SCOPE_SENT",
        inspectionStatus: "released",
        returnNotes: null,
        scopeStatus: "sent",
      }),
    ).toBe("scope_sent");

    expect(
      deriveAssessmentState({
        applicationStatus: "REPAIR_APPROVED",
        inspectionStatus: "released",
        returnNotes: null,
        scopeStatus: "signed",
      }),
    ).toBe("approved");
  });

  it("calculates scope subtotal, 16% VAT, and excludes deferred items", () => {
    const totals = calculateScopeTotals([
      { partsKes: 18000, labourKes: 6000, decision: "approved" },
      { partsKes: 5000, labourKes: 2000, decision: "deferred" },
    ]);
    expect(totals.subtotalKes).toBe(24000);
    expect(totals.vatKes).toBe(3840);
    expect(totals.totalKes).toBe(27840);
  });
});
