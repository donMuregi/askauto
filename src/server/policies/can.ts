import { DomainError } from "@/lib/errors";
import type { Actor, StaffRole } from "@/server/db/rls";

export type PolicyAction =
  | "application:create"
  | "application:read"
  | "application:update_details"
  | "application:book"
  | "application:cancel"
  | "application:transition"
  | "inspection:read"
  | "inspection:write"
  | "inspection:submit"
  | "inspection:release"
  | "inspection:return"
  | "scope:read"
  | "scope:build"
  | "scope:approve_variance"
  | "scope:send"
  | "scope:sign"
  | "upload:create"
  | "upload:read"
  | "upload:review"
  | "document:read"
  | "ops_review:complete"
  | "lender_submission:forward"
  | "lender_submission:read"
  | "lender_submission:decide"
  | "offer:respond"
  | "attestation:record_lender_approval"
  | "attestation:record_funds_received"
  | "job_card:read"
  | "job_card:write"
  | "handover:record"
  | "handover:confirm"
  | "repayment:report"
  | "repayment:read"
  | "admin:manage_settings"
  | "admin:manage_users"
  | "admin:manage_lenders"
  | "admin:manage_employers"
  | "admin:manage_catalogue"
  | "admin:manage_garages"
  | "admin:read_audit"
  | "notification:read_own"
  | "notification:read_log"
  | "notification:resend"
  | "account:manage_own"
  | "fee:manage";

export interface PolicyResource {
  ownerUserId?: string | null;
  customerId?: string | null;
  lenderId?: string | null;
  hasLenderSubmission?: boolean;
  assessorId?: string | null;
  garageId?: string | null;
  inspectionStatus?: string | null;
  bothAttestationsPresent?: boolean;
}

function hasAnyRole(actor: Actor, allowed: StaffRole[]): boolean {
  return actor.kind === "staff" && actor.roles.some((r) => allowed.includes(r));
}

export function can(actor: Actor, action: PolicyAction, resource: PolicyResource = {}): boolean {
  if (actor.kind === "system") {
    return true;
  }

  switch (action) {
    case "account:manage_own":
    case "notification:read_own":
      return Boolean(actor.userId && (!resource.ownerUserId || resource.ownerUserId === actor.userId));

    case "application:create":
    case "application:update_details":
    case "application:book":
    case "scope:sign":
    case "offer:respond":
    case "handover:confirm":
      return (
        actor.kind === "customer" &&
        Boolean(actor.emailVerified || actor.phoneNumberVerified) &&
        (!resource.customerId || resource.customerId === actor.customerId)
      );

    case "application:read":
      if (actor.kind === "customer") {
        return Boolean(resource.customerId && resource.customerId === actor.customerId);
      }
      if (actor.kind === "lender") {
        // R7: lender can only read applications assigned to their lender with a submission
        return Boolean(
          actor.lenderId &&
            resource.lenderId === actor.lenderId &&
            resource.hasLenderSubmission === true,
        );
      }
      return hasAnyRole(actor, ["admin", "ops_reviewer", "ops_approver", "accounts", "garage"]);

    case "application:cancel":
      if (actor.kind === "customer") {
        return Boolean(resource.customerId && resource.customerId === actor.customerId);
      }
      return hasAnyRole(actor, ["admin", "ops_reviewer", "ops_approver"]);

    case "application:transition":
      return actor.kind === "customer" || actor.kind === "staff" || actor.kind === "lender";

    case "inspection:read":
      if (actor.kind === "customer") {
        // R11: customer can only see the diagnostic report after release
        return Boolean(
          resource.customerId === actor.customerId && resource.inspectionStatus === "released",
        );
      }
      if (hasAnyRole(actor, ["assessor"])) {
        return !resource.assessorId || resource.assessorId === actor.userId;
      }
      return hasAnyRole(actor, ["admin", "ops_reviewer", "ops_approver"]);

    case "inspection:write":
    case "inspection:submit":
      return (
        hasAnyRole(actor, ["assessor", "admin"]) &&
        (!resource.assessorId || resource.assessorId === actor.userId)
      );

    case "inspection:release":
    case "inspection:return":
      return hasAnyRole(actor, ["ops_reviewer", "ops_approver", "assessor", "admin"]);

    case "scope:read":
      if (actor.kind === "customer") {
        return Boolean(resource.customerId === actor.customerId);
      }
      if (actor.kind === "lender") {
        return Boolean(
          actor.lenderId &&
            resource.lenderId === actor.lenderId &&
            resource.hasLenderSubmission === true,
        );
      }
      return hasAnyRole(actor, ["admin", "ops_reviewer", "ops_approver", "assessor", "accounts"]);

    case "scope:build":
    case "scope:send":
      return hasAnyRole(actor, ["ops_reviewer", "ops_approver", "assessor", "admin"]);

    case "scope:approve_variance":
      return hasAnyRole(actor, ["ops_approver", "admin"]);

    case "upload:create":
      if (actor.kind === "customer") {
        return Boolean(
          (actor.emailVerified || actor.phoneNumberVerified) &&
            resource.customerId === actor.customerId,
        );
      }
      return hasAnyRole(actor, ["ops_reviewer", "ops_approver", "admin"]);

    case "upload:read":
    case "document:read":
      if (actor.kind === "customer") {
        return Boolean(resource.customerId === actor.customerId);
      }
      if (actor.kind === "lender") {
        return Boolean(
          actor.lenderId &&
            resource.lenderId === actor.lenderId &&
            resource.hasLenderSubmission === true,
        );
      }
      return hasAnyRole(actor, ["admin", "ops_reviewer", "ops_approver", "accounts"]);

    case "upload:review":
    case "ops_review:complete":
    case "lender_submission:forward":
      return hasAnyRole(actor, ["ops_reviewer", "ops_approver", "admin"]);

    case "lender_submission:read":
      if (actor.kind === "lender") {
        return Boolean(actor.lenderId && resource.lenderId === actor.lenderId);
      }
      return hasAnyRole(actor, ["admin", "ops_reviewer", "ops_approver", "accounts"]);

    case "lender_submission:decide":
    case "attestation:record_lender_approval":
      return (
        actor.kind === "lender" &&
        actor.lenderRole === "approver" &&
        Boolean(actor.lenderId && resource.lenderId === actor.lenderId)
      );

    case "attestation:record_funds_received":
    case "fee:manage":
      return hasAnyRole(actor, ["accounts", "admin"]);

    case "job_card:read":
    case "job_card:write":
    case "handover:record":
      // R4 & R10: garage cannot open or access job card before both payment attestations
      if (resource.bothAttestationsPresent === false) {
        return false;
      }
      if (hasAnyRole(actor, ["garage"])) {
        return !resource.garageId || resource.garageId === actor.garageId;
      }
      return hasAnyRole(actor, ["admin", "ops_reviewer", "ops_approver"]);

    case "repayment:report":
      return (
        actor.kind === "lender" &&
        Boolean(actor.lenderId && resource.lenderId === actor.lenderId)
      );

    case "repayment:read":
      if (actor.kind === "customer") {
        return Boolean(resource.customerId === actor.customerId);
      }
      if (actor.kind === "lender") {
        return Boolean(actor.lenderId && resource.lenderId === actor.lenderId);
      }
      return hasAnyRole(actor, ["admin", "ops_reviewer", "ops_approver", "accounts"]);

    case "admin:manage_settings":
    case "admin:manage_users":
    case "admin:manage_lenders":
    case "admin:manage_catalogue":
    case "admin:manage_garages":
    case "admin:read_audit":
      return hasAnyRole(actor, ["admin"]);

    case "admin:manage_employers":
    case "notification:read_log":
    case "notification:resend":
      return hasAnyRole(actor, ["admin", "ops_reviewer", "ops_approver"]);

    default:
      return false;
  }
}

export function authorize(
  actor: Actor,
  action: PolicyAction,
  resource: PolicyResource = {},
): void {
  if (!can(actor, action, resource)) {
    throw new DomainError(
      "FORBIDDEN",
      "You do not have permission to perform this action.",
      403,
    );
  }
}
