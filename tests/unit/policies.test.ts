import { describe, expect, it } from "vitest";
import type { Actor } from "@/server/db/rls";
import { can } from "@/server/policies/can";

const verifiedCustomer: Actor = {
  userId: "u-cust-1",
  kind: "customer",
  customerId: "c-1",
  roles: [],
  emailVerified: true,
  phoneNumberVerified: true,
};

const unverifiedCustomer: Actor = {
  ...verifiedCustomer,
  phoneNumberVerified: false,
};

const assessor: Actor = {
  userId: "u-assessor-1",
  kind: "staff",
  roles: ["assessor"],
  mfaVerified: true,
};

const lenderA: Actor = {
  userId: "u-lender-a",
  kind: "lender",
  lenderId: "lender-a",
  lenderRole: "approver",
  roles: [],
  mfaVerified: true,
};

const garageUser: Actor = {
  userId: "u-garage-1",
  kind: "staff",
  roles: ["garage"],
  garageId: "g-1",
  mfaVerified: true,
};

describe("centralised policies can()", () => {
  it("blocks unverified customers from creating applications", () => {
    expect(can(unverifiedCustomer, "application:create")).toBe(false);
    expect(can(verifiedCustomer, "application:create")).toBe(true);
  });

  it("enforces R7: lender can only read assigned applications with a submission", () => {
    expect(
      can(lenderA, "application:read", { lenderId: "lender-a", hasLenderSubmission: true }),
    ).toBe(true);
    expect(
      can(lenderA, "application:read", { lenderId: "lender-a", hasLenderSubmission: false }),
    ).toBe(false);
    expect(
      can(lenderA, "application:read", { lenderId: "lender-b", hasLenderSubmission: true }),
    ).toBe(false);
  });

  it("enforces R8: assessors never read priced scopes", () => {
    expect(can(assessor, "scope:read")).toBe(false);
  });

  it("enforces R10: garage cannot access job card before both payment attestations", () => {
    expect(
      can(garageUser, "job_card:read", { garageId: "g-1", bothAttestationsPresent: false }),
    ).toBe(false);
    expect(
      can(garageUser, "job_card:read", { garageId: "g-1", bothAttestationsPresent: true }),
    ).toBe(true);
  });

  it("enforces R11: customer can only see diagnostic report after release", () => {
    expect(
      can(verifiedCustomer, "inspection:read", { customerId: "c-1", inspectionStatus: "submitted" }),
    ).toBe(false);
    expect(
      can(verifiedCustomer, "inspection:read", { customerId: "c-1", inspectionStatus: "released" }),
    ).toBe(true);
  });
});
