import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import { citext, docTypeEnum, productCodeEnum, repaymentFrequencyEnum } from "./enums";
import { lenders } from "./auth";

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable("products", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  code: productCodeEnum("code").notNull().unique(),
  name: text("name").notNull(),
  repaymentFrequency: repaymentFrequencyEnum("repayment_frequency").notNull(),
  lenderMode: text("lender_mode").notNull(), // "fixed" | "by_scheme"
  fixedLenderId: uuid("fixed_lender_id").references(() => lenders.id),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productDocumentRequirements = pgTable(
  "product_document_requirements",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    productCode: productCodeEnum("product_code").notNull(),
    docType: docTypeEnum("doc_type").notNull(),
    required: boolean("required").notNull().default(true),
    uploadedBy: text("uploaded_by").notNull(), // "customer" | "ops"
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("product_doc_req_unique_idx").on(t.productCode, t.docType)],
);

export const serviceCatalogue = pgTable("service_catalogue", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  descriptionTemplate: text("description_template").notNull(),
  labourMinKes: integer("labour_min_kes").notNull(),
  labourMaxKes: integer("labour_max_kes").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const catalogueParts = pgTable("catalogue_parts", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  serviceId: uuid("service_id")
    .notNull()
    .references(() => serviceCatalogue.id, { onDelete: "cascade" }),
  grade: text("grade").notNull(), // "OEM" | "aftermarket" | "none"
  brand: text("brand").notNull(),
  priceMinKes: integer("price_min_kes").notNull(),
  priceMaxKes: integer("price_max_kes").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messageTemplates = pgTable(
  "message_templates",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    key: text("key").notNull(),
    locale: text("locale").notNull().default("en"),
    channel: text("channel").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("message_templates_key_locale_channel_idx").on(t.key, t.locale, t.channel)],
);

export const employers = pgTable("employers", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  name: text("name").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: citext("contact_email").notNull(),
  contactPhone: text("contact_phone").notNull(),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employerSchemes = pgTable("employer_schemes", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  employerId: uuid("employer_id")
    .notNull()
    .references(() => employers.id, { onDelete: "cascade" }),
  lenderId: uuid("lender_id")
    .notNull()
    .references(() => lenders.id),
  agreementRef: text("agreement_ref").notNull().unique(),
  deductionCapNote: text("deduction_cap_note"),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  status: text("status").notNull().default("active"), // "active" | "suspended" | "ended"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const employerEligibleEmployees = pgTable(
  "employer_eligible_employees",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    schemeId: uuid("scheme_id")
      .notNull()
      .references(() => employerSchemes.id, { onDelete: "cascade" }),
    employeeNumber: text("employee_number").notNull(),
    fullName: text("full_name").notNull(),
    nationalIdHash: text("national_id_hash"),
    yearsInService: integer("years_in_service").notNull().default(0),
    active: boolean("active").notNull().default(true),
    batchId: uuid("batch_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("employer_eligible_scheme_emp_no_idx").on(t.schemeId, t.employeeNumber)],
);
