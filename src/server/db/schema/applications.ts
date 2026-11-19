import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { applicationStatusEnum, platformEnum, productCodeEnum } from "./enums";
import { customers, garages, lenders, user } from "./auth";
import { employerSchemes } from "./config";

export const referenceCounters = pgTable("reference_counters", {
  year: integer("year").primaryKey(),
  lastValue: integer("last_value").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const vehicles = pgTable("vehicles", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  regNo: text("reg_no").notNull(),
  makeModel: text("make_model").notNull(),
  year: integer("year"),
  fuel: text("fuel"),
  transmission: text("transmission"),
  vehicleClass: text("vehicle_class"),
  accessories: text("accessories").array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const applications = pgTable(
  "applications",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    reference: text("reference").unique(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    productCode: productCodeEnum("product_code").notNull(),
    lenderId: uuid("lender_id").references(() => lenders.id),
    employerSchemeId: uuid("employer_scheme_id").references(() => employerSchemes.id),
    employeeNumber: text("employee_number"),
    yearsInService: integer("years_in_service"),
    platform: platformEnum("platform"),
    platformOther: text("platform_other"),
    platformRating: numeric("platform_rating", { precision: 2, scale: 1 }),
    vehicleId: uuid("vehicle_id").references(() => vehicles.id),
    faultDescription: text("fault_description"),
    status: applicationStatusEnum("status").notNull().default("DRAFT"),
    substatus: text("substatus"),
    financingEligible: boolean("financing_eligible"),
    depositKes: integer("deposit_kes").notNull().default(0),
    sourceCode: text("source_code"),
    isActive: boolean("is_active").notNull().default(true),
    cancelledReason: text("cancelled_reason"),
    assignedReviewerId: text("assigned_reviewer_id").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("applications_status_idx").on(t.status),
    index("applications_customer_id_idx").on(t.customerId),
    index("applications_lender_status_idx").on(t.lenderId, t.status),
    index("applications_product_status_idx").on(t.productCode, t.status),
    uniqueIndex("applications_one_active_per_customer_idx")
      .on(t.customerId)
      .where(sql`${t.isActive} = true`),
  ],
);

export const statusHistory = pgTable(
  "status_history",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    fromStatus: applicationStatusEnum("from_status"),
    toStatus: applicationStatusEnum("to_status").notNull(),
    actorUserId: text("actor_user_id").references(() => user.id, { onDelete: "set null" }),
    actorType: text("actor_type").notNull(), // "customer" | "staff" | "lender" | "system"
    reason: text("reason"),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("status_history_app_created_idx").on(t.applicationId, t.createdAt)],
);

export const consents = pgTable("consents", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  noticeVersion: text("notice_version").notNull(),
  textSha256: text("text_sha256").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const bookings = pgTable("bookings", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  garageId: uuid("garage_id")
    .notNull()
    .references(() => garages.id),
  slotStart: timestamp("slot_start", { withTimezone: true }).notNull(),
  slotEnd: timestamp("slot_end", { withTimezone: true }).notNull(),
  assessorId: text("assessor_id").references(() => user.id),
  status: text("status").notNull().default("booked"), // "booked" | "rescheduled" | "cancelled" | "no_show" | "completed"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const feePayments = pgTable(
  "fee_payments",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    applicationId: uuid("application_id").references(() => applications.id, { onDelete: "restrict" }),
    amountKes: integer("amount_kes").notNull(),
    msisdnHash: text("msisdn_hash").notNull(),
    msisdnLast4: text("msisdn_last4").notNull(),
    checkoutRequestId: text("checkout_request_id").unique(),
    merchantRequestId: text("merchant_request_id"),
    mpesaReceipt: text("mpesa_receipt").unique(),
    status: text("status").notNull().default("pending"), // "pending" | "paid" | "failed" | "expired" | "refund_requested" | "refunded"
    resultCode: text("result_code"),
    resultDesc: text("result_desc"),
    rawCallback: jsonb("raw_callback").$type<Record<string, unknown>>(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    refundNote: text("refund_note"),
    refundedBy: text("refunded_by").references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("fee_payments_checkout_idx").on(t.checkoutRequestId),
    index("fee_payments_application_idx").on(t.applicationId),
  ],
);
