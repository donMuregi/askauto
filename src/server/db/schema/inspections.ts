import { sql } from "drizzle-orm";
import {
  boolean,
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
import { bytea, docTypeEnum, generatedDocTypeEnum, urgencyEnum } from "./enums";
import { user } from "./auth";
import { applications, bookings } from "./applications";
import { serviceCatalogue } from "./config";

export const documents = pgTable(
  "documents",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    type: generatedDocTypeEnum("type").notNull(),
    docNumber: text("doc_number").notNull().unique(),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("draft"), // "draft" | "issued" | "superseded"
    dataSnapshot: jsonb("data_snapshot").$type<Record<string, unknown>>().notNull(),
    pdfKey: text("pdf_key"),
    pdfSha256: text("pdf_sha256"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    immutable: boolean("immutable").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("documents_application_type_idx").on(t.applicationId, t.type)],
);

export const signatures = pgTable("signatures", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "restrict" }),
  method: text("method").notNull(), // "otp_confirm" | "drawn"
  otpVerifiedAt: timestamp("otp_verified_at", { withTimezone: true }),
  signatureImageKey: text("signature_image_key"),
  typedName: text("typed_name").notNull(),
  ip: text("ip"),
  userAgent: text("user_agent"),
  documentSha256: text("document_sha256").notNull(),
  signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inspections = pgTable(
  "inspections",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    bookingId: uuid("booking_id")
      .notNull()
      .references(() => bookings.id),
    assessorId: text("assessor_id")
      .notNull()
      .references(() => user.id),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("draft"), // "draft" | "submitted" | "released" | "superseded"
    mileageKm: integer("mileage_km"),
    odometerPhotoId: uuid("odometer_photo_id"),
    durationMinutes: integer("duration_minutes"),
    diagnosticsRun: text("diagnostics_run").array().notNull().default(sql`'{}'::text[]`),
    faultCodes: text("fault_codes").array().notNull().default(sql`'{}'::text[]`),
    fuelTransmissionNote: text("fuel_transmission_note"),
    geofenceResult: jsonb("geofence_result").$type<Record<string, unknown>>(),
    returnNotes: text("return_notes"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releasedBy: text("released_by").references(() => user.id),
    assessorSignatureId: uuid("assessor_signature_id").references(() => signatures.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("inspections_app_version_idx").on(t.applicationId, t.version)],
);

export const findings = pgTable(
  "findings",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    inspectionId: uuid("inspection_id")
      .notNull()
      .references(() => inspections.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    componentCode: text("component_code").notNull(),
    componentLabel: text("component_label").notNull(),
    findingText: text("finding_text").notNull(),
    recommendedAction: text("recommended_action").notNull(),
    urgency: urgencyEnum("urgency").notNull(),
    serviceId: uuid("service_id").references(() => serviceCatalogue.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("findings_inspection_seq_idx").on(t.inspectionId, t.seq)],
);

export const inspectionPhotos = pgTable("inspection_photos", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  inspectionId: uuid("inspection_id")
    .notNull()
    .references(() => inspections.id, { onDelete: "cascade" }),
  findingId: uuid("finding_id").references(() => findings.id, { onDelete: "set null" }),
  kind: text("kind").notNull(), // "front_3q" | "rear_3q" | "near_side" | "off_side" | "odometer" | "finding" | "other"
  storageKey: text("storage_key").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  lat: text("lat"),
  lng: text("lng"),
  accuracyM: integer("accuracy_m"),
  sha256: text("sha256").notNull(),
  deviceInfo: text("device_info"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scopes = pgTable(
  "scopes",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("draft"), // "draft" | "pending_approval" | "sent" | "signed" | "superseded" | "rejected"
    subtotalKes: integer("subtotal_kes").notNull().default(0),
    vatKes: integer("vat_kes").notNull().default(0),
    totalKes: integer("total_kes").notNull().default(0),
    vatRatePct: integer("vat_rate_pct").notNull().default(16),
    feeCreditKes: integer("fee_credit_kes").notNull().default(0),
    builtBy: text("built_by")
      .notNull()
      .references(() => user.id),
    approvedBy: text("approved_by").references(() => user.id),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    signatureId: uuid("signature_id").references(() => signatures.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("scopes_app_version_idx").on(t.applicationId, t.version)],
);

export const scopeItems = pgTable("scope_items", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  scopeId: uuid("scope_id")
    .notNull()
    .references(() => scopes.id, { onDelete: "cascade" }),
  seq: integer("seq").notNull(),
  serviceId: uuid("service_id")
    .notNull()
    .references(() => serviceCatalogue.id),
  serviceCode: text("service_code").notNull(),
  description: text("description").notNull(),
  partGrade: text("part_grade").notNull(),
  partBrand: text("part_brand"),
  partsKes: integer("parts_kes").notNull().default(0),
  labourKes: integer("labour_kes").notNull().default(0),
  lineTotalKes: integer("line_total_kes").notNull().default(0),
  varianceFlag: boolean("variance_flag").notNull().default(false),
  decision: text("decision").notNull().default("approved"), // "approved" | "deferred"
  deferredReason: text("deferred_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const uploads = pgTable(
  "uploads",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    docType: docTypeEnum("doc_type").notNull(),
    uploadedByUserId: text("uploaded_by_user_id")
      .notNull()
      .references(() => user.id),
    storageKey: text("storage_key").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256"),
    filePasswordEnc: bytea("file_password_enc"),
    status: text("status").notNull().default("uploaded"), // "uploaded" | "approved" | "rejected" | "replaced"
    replacedBy: uuid("replaced_by"),
    virusScan: text("virus_scan").notNull().default("pending"), // "pending" | "clean" | "infected"
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("uploads_app_doctype_idx").on(t.applicationId, t.docType)],
);

export const documentReviews = pgTable("document_reviews", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  uploadId: uuid("upload_id")
    .notNull()
    .references(() => uploads.id, { onDelete: "cascade" }),
  reviewerId: text("reviewer_id")
    .notNull()
    .references(() => user.id),
  decision: text("decision").notNull(), // "approved" | "rejected"
  reasonCode: text("reason_code"),
  note: text("note"),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const opsReviews = pgTable("ops_reviews", {
  id: uuid("id")
    .primaryKey()
    .$defaultFn(() => uuidv7()),
  applicationId: uuid("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "cascade" }),
  checklist: jsonb("checklist").$type<Record<string, unknown>>().notNull().default({}),
  priceCheck: jsonb("price_check").$type<Record<string, unknown>>().notNull().default({}),
  status: text("status").notNull().default("pending"), // "pending" | "passed" | "failed"
  slaDueAt: timestamp("sla_due_at", { withTimezone: true }),
  reviewerId: text("reviewer_id").references(() => user.id),
  approverId: text("approver_id").references(() => user.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
