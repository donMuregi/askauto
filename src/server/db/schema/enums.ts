import { customType, pgEnum } from "drizzle-orm/pg-core";

export const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return "citext";
  },
});

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const cidrArray = customType<{ data: string[]; driverData: string[] }>({
  dataType() {
    return "cidr[]";
  },
});

export const userKindEnum = pgEnum("user_kind", ["customer", "staff", "lender"]);

export const userStatusEnum = pgEnum("user_status", [
  "active",
  "suspended",
  "pending_invite",
  "deleted",
]);

export const staffRoleEnum = pgEnum("staff_role", [
  "admin",
  "ops_reviewer",
  "ops_approver",
  "assessor",
  "garage",
  "accounts",
]);

export const lenderRoleEnum = pgEnum("lender_role", ["approver", "viewer"]);

export const productCodeEnum = pgEnum("product_code", ["RIDE_HAILING", "SALARIED"]);

export const repaymentFrequencyEnum = pgEnum("repayment_frequency", ["daily", "monthly"]);

export const platformEnum = pgEnum("platform", ["uber", "bolt", "little", "other"]);

export const applicationStatusEnum = pgEnum("application_status", [
  "DRAFT",
  "BOOKED",
  "REPORT_SUBMITTED",
  "REPORT_READY",
  "SCOPE_SENT",
  "REPAIR_APPROVED",
  "UNDER_REVIEW",
  "WITH_LENDER",
  "OFFER_MADE",
  "APPROVED",
  "REPAIR_IN_PROGRESS",
  "REPAYING",
  "SETTLED",
  "DECLINED",
  "CANCELLED",
  "EXPIRED",
  "CASH_ROUTE",
]);

export const urgencyEnum = pgEnum("urgency", [
  "do_not_delay",
  "within_1_month",
  "with_the_above",
  "three_to_four_months",
  "monitor",
  "no_action",
]);

export const docTypeEnum = pgEnum("doc_type", [
  "national_id_front",
  "national_id_back",
  "selfie",
  "psv_licence",
  "good_conduct",
  "logbook",
  "insurance",
  "app_profile",
  "earnings_statement",
  "mpesa_statement",
  "payroll_consent",
  "employer_confirmation",
]);

export const generatedDocTypeEnum = pgEnum("generated_doc_type", [
  "consent_notice",
  "diagnostic_report",
  "approved_repair_scope",
  "request_for_financing",
  "lender_offer",
  "job_card",
  "handover_certificate",
]);

export const notificationChannelEnum = pgEnum("notification_channel", [
  "email",
  "sms",
  "whatsapp",
  "in_app",
]);

export const authEventTypeEnum = pgEnum("auth_event_type", [
  "sign_up",
  "sign_in_success",
  "sign_in_failure",
  "sign_out",
  "password_reset_requested",
  "password_reset_completed",
  "password_changed",
  "email_changed",
  "phone_changed",
  "mfa_enrolled",
  "mfa_reset",
  "session_revoked",
  "account_locked",
]);
