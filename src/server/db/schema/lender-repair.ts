import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { repaymentFrequencyEnum, urgencyEnum } from "./enums";
import { garages, lenders, user } from "./auth";
import { applications } from "./applications";
import { documents, scopeItems, signatures } from "./inspections";
import { serviceCatalogue } from "./config";

export const lenderSubmissions = pgTable(
  "lender_submissions",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    lenderId: uuid("lender_id")
      .notNull()
      .references(() => lenders.id),
    packageVersion: integer("package_version").notNull().default(1),
    status: text("status").notNull().default("submitted"), // "submitted" | "info_requested" | "approved" | "declined" | "withdrawn"
    package: jsonb("package").$type<Record<string, unknown>>().notNull(),
    submittedBy: text("submitted_by")
      .notNull()
      .references(() => user.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lender_submissions_lender_status_idx").on(t.lenderId, t.status)],
);

export const lenderDecisions = pgTable("lender_decisions", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  submissionId: uuid("submission_id")
    .notNull()
    .references(() => lenderSubmissions.id, { onDelete: "cascade" }),
  decidedBy: text("decided_by")
    .notNull()
    .references(() => user.id),
  decision: text("decision").notNull(), // "approve" | "decline" | "request_info"
  approvedAmountKes: integer("approved_amount_kes"),
  installmentKes: integer("installment_kes"),
  frequency: repaymentFrequencyEnum("frequency"),
  tenorCount: integer("tenor_count"),
  rateText: text("rate_text"),
  feesText: text("fees_text"),
  totalPayableKes: integer("total_payable_kes"),
  declineReasonCode: text("decline_reason_code"),
  note: text("note"),
  offerDocumentId: uuid("offer_document_id").references(() => documents.id),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const offers = pgTable("offers", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  decisionId: uuid("decision_id")
    .notNull()
    .references(() => lenderDecisions.id, { onDelete: "cascade" }),
  customerResponse: text("customer_response").notNull().default("pending"), // "pending" | "accepted" | "declined" | "expired"
  respondedAt: timestamp("responded_at", { withTimezone: true }),
  signatureId: uuid("signature_id").references(() => signatures.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const repaymentTerms = pgTable("repayment_terms", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  applicationId: uuid("application_id")
    .notNull()
    .unique()
    .references(() => applications.id, { onDelete: "cascade" }),
  frequency: repaymentFrequencyEnum("frequency").notNull(),
  installmentKes: integer("installment_kes").notNull(),
  tenorCount: integer("tenor_count").notNull(),
  firstDueDate: date("first_due_date").notNull(),
  totalPayableKes: integer("total_payable_kes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paymentAttestations = pgTable(
  "payment_attestations",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // "lender_approval" | "funds_received"
    amountKes: integer("amount_kes").notNull(),
    reference: text("reference").notNull(),
    expectedDate: date("expected_date"),
    discrepancyFlag: boolean("discrepancy_flag").notNull().default(false),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => user.id),
    secondApproverId: text("second_approver_id").references(() => user.id),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payment_attestations_app_kind_idx").on(t.applicationId, t.kind)],
);

export const repaymentReports = pgTable("repayment_reports", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  asOfDate: date("as_of_date").notNull(),
  state: text("state").notNull(), // "current" | "catch_up" | "arrears" | "settled"
  installmentsPaid: integer("installments_paid").notNull().default(0),
  installmentsMissed: integer("installments_missed").notNull().default(0),
  note: text("note"),
  source: text("source").notNull(), // "csv" | "api" | "manual"
  batchId: uuid("batch_id"),
  reportedBy: text("reported_by")
    .notNull()
    .references(() => user.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobCards = pgTable("job_cards", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  applicationId: uuid("application_id")
    .notNull()
    .unique()
    .references(() => applications.id, { onDelete: "cascade" }),
  jobNo: integer("job_no").notNull().unique(),
  garageId: uuid("garage_id")
    .notNull()
    .references(() => garages.id),
  status: text("status").notNull().default("opened"), // "opened" | "in_progress" | "completed"
  mileageIn: integer("mileage_in"),
  mileageOut: integer("mileage_out"),
  arrivalChecks: jsonb("arrival_checks").$type<Record<string, unknown>>().notNull().default({}),
  openedBy: text("opened_by").references(() => user.id),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobCardLines = pgTable("job_card_lines", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  jobCardId: uuid("job_card_id")
    .notNull()
    .references(() => jobCards.id, { onDelete: "cascade" }),
  scopeItemId: uuid("scope_item_id")
    .notNull()
    .references(() => scopeItems.id),
  technicianName: text("technician_name"),
  partFitted: text("part_fitted"),
  grade: text("grade"),
  warrantyToDate: date("warranty_to_date"),
  warrantyToKm: integer("warranty_to_km"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const jobCardPhotos = pgTable("job_card_photos", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  jobCardId: uuid("job_card_id")
    .notNull()
    .references(() => jobCards.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // "before" | "after" | "old_parts" | "alignment"
  storageKey: text("storage_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recommendations = pgTable("recommendations", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  jobCardId: uuid("job_card_id")
    .notNull()
    .references(() => jobCards.id, { onDelete: "cascade" }),
  serviceId: uuid("service_id").references(() => serviceCatalogue.id),
  finding: text("finding").notNull(),
  urgency: urgencyEnum("urgency").notNull(),
  reminderOn: date("reminder_on"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const handovers = pgTable("handovers", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  applicationId: uuid("application_id")
    .notNull()
    .unique()
    .references(() => applications.id, { onDelete: "cascade" }),
  roadTestKm: integer("road_test_km"),
  roadTestResult: text("road_test_result"),
  walkthroughDone: boolean("walkthrough_done").notNull().default(false),
  partsReturned: boolean("parts_returned").notNull().default(false),
  alignmentPrintoutKey: text("alignment_printout_key"),
  nextServiceKm: integer("next_service_km"),
  nextServiceDate: date("next_service_date"),
  driveEasyPoints: integer("drive_easy_points"),
  customerSignatureId: uuid("customer_signature_id").references(() => signatures.id),
  handedOverAt: timestamp("handed_over_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
