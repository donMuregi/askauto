import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/db/rls";
import {
  findTransitionRule,
  isActorAllowedForRule,
} from "@/server/domain/applications/transition";

const customer: Actor = { userId: "c1", kind: "customer", roles: [] };
const system: Actor = { userId: null, kind: "system", roles: [] };
const assessor: Actor = { userId: "a1", kind: "staff", roles: ["assessor"] };
const ops: Actor = { userId: "o1", kind: "staff", roles: ["ops_reviewer"] };
const lender: Actor = { userId: "l1", kind: "lender", lenderId: "lid", lenderRole: "approver", roles: [] };

describe("state machine transition table", () => {
  it("allows valid transitions with the right actor", () => {
    const toBooked = findTransitionRule("DRAFT", "BOOKED");
    expect(toBooked).toBeDefined();
    expect(isActorAllowedForRule(system, toBooked!.allowedActors)).toBe(true);
    expect(isActorAllowedForRule(customer, toBooked!.allowedActors)).toBe(false);

    const toSubmitted = findTransitionRule("BOOKED", "REPORT_SUBMITTED");
    expect(isActorAllowedForRule(assessor, toSubmitted!.allowedActors)).toBe(true);
    expect(isActorAllowedForRule(ops, toSubmitted!.allowedActors)).toBe(false);

    const toOffer = findTransitionRule("WITH_LENDER", "OFFER_MADE");
    expect(isActorAllowedForRule(lender, toOffer!.allowedActors)).toBe(true);
    expect(isActorAllowedForRule(ops, toOffer!.allowedActors)).toBe(false);
  });

  it("rejects unlisted transitions", () => {
    expect(findTransitionRule("DRAFT", "REPAIR_IN_PROGRESS")).toBeUndefined();
    expect(findTransitionRule("BOOKED", "WITH_LENDER")).toBeUndefined();
    expect(findTransitionRule("REPAIR_IN_PROGRESS", "CANCELLED")).toBeUndefined();
  });
});
