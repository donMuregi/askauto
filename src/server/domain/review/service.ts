import { addHours } from "date-fns";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { decryptField, sha256Hex } from "@/lib/crypto";
import { DomainError } from "@/lib/errors";
import { getDb } from "@/server/db/client";
import { withActor, type Actor } from "@/server/db/rls";
import {
  applications,
  consents,
  customers,
  documentReviews,
  documents,
  employerSchemes,
  employers,
  findings,
  inspections,
  lenders,
  lenderSubmissions,
  opsReviews,
  productDocumentRequirements,
  products,
  scopeItems,
  scopes,
  uploads,
  user,
  vehicles,
} from "@/server/db/schema";
import { audit } from "@/server/domain/audit";
import { transition } from "@/server/domain/applications/transition";
import { authorize } from "@/server/policies/can";

export async function getCustomerDocumentsChecklist(applicationId: string) {
  const db = getDb();
  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app) {
    throw new DomainError("NOT_FOUND", "Application not found.", 404);
  }

  const [requirements, allUploads, allReviews] = await Promise.all([
    db
      .select()
      .from(productDocumentRequirements)
      .where(eq(productDocumentRequirements.productCode, app.productCode))
      .orderBy(asc(productDocumentRequirements.sort)),
    db
      .select()
      .from(uploads)
      .where(and(eq(uploads.applicationId, app.id), ne(uploads.status, "replaced")))
      .orderBy(desc(uploads.createdAt)),
    db
      .select({
        uploadId: documentReviews.uploadId,
        decision: documentReviews.decision,
        reasonCode: documentReviews.reasonCode,
        note: documentReviews.note,
        decidedAt: documentReviews.decidedAt,
      })
      .from(documentReviews)
      .innerJoin(uploads, eq(documentReviews.uploadId, uploads.id))
      .where(eq(uploads.applicationId, app.id))
      .orderBy(desc(documentReviews.decidedAt)),
  ]);

  const latestUploadByType = new Map<string, (typeof allUploads)[number]>();
  for (const u of allUploads) {
    if (!latestUploadByType.has(u.docType)) {
      latestUploadByType.set(u.docType, u);
    }
  }

  const latestReviewByUpload = new Map<string, (typeof allReviews)[number]>();
  for (const r of allReviews) {
    if (!latestReviewByUpload.has(r.uploadId)) {
      latestReviewByUpload.set(r.uploadId, r);
    }
  }

  return requirements.map((req) => {
    const upload = latestUploadByType.get(req.docType) ?? null;
    const review = upload ? (latestReviewByUpload.get(upload.id) ?? null) : null;
    return {
      docType: req.docType,
      required: req.required,
      uploadedBy: req.uploadedBy as "customer" | "ops",
      upload: upload
        ? {
            id: upload.id,
            status: upload.status,
            mime: upload.mime,
            sizeBytes: upload.sizeBytes,
            createdAt: upload.createdAt,
            hasPassword: Boolean(upload.filePasswordEnc),
          }
        : null,
      latestReview: review,
    };
  });
}

export async function submitCustomerDocumentsService(actor: Actor, applicationId: string) {
  if (!actor.userId || !actor.customerId) {
    throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);
  }

  return withActor(actor, async ({ db }) => {
    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);
    if (!app) {
      throw new DomainError("NOT_FOUND", "Application not found.", 404);
    }
    authorize(actor, "upload:create", { customerId: app.customerId });

    if (app.status !== "REPAIR_APPROVED") {
      throw new DomainError(
        "VALIDATION_ERROR",
        "Documents can only be submitted after your repair scope is approved.",
        400,
      );
    }

    const reqs = await db
      .select()
      .from(productDocumentRequirements)
      .where(
        and(
          eq(productDocumentRequirements.productCode, app.productCode),
          eq(productDocumentRequirements.required, true),
          eq(productDocumentRequirements.uploadedBy, "customer"),
        ),
      );

    const activeUploads = await db
      .select()
      .from(uploads)
      .where(and(eq(uploads.applicationId, app.id), ne(uploads.status, "replaced")));

    const presentTypes = new Set(
      activeUploads
        .filter((u) => u.status === "uploaded" || u.status === "approved")
        .map((u) => u.docType),
    );

    const missing = reqs.filter((r) => !presentTypes.has(r.docType));
    if (missing.length > 0) {
      throw new DomainError(
        "VALIDATION_ERROR",
        `Upload all required documents before submitting (${missing.length} remaining).`,
        400,
      );
    }

    const [existingReview] = await db
      .select()
      .from(opsReviews)
      .where(eq(opsReviews.applicationId, app.id))
      .limit(1);

    const slaDueAt = addHours(new Date(), 8);
    if (!existingReview) {
      await db.insert(opsReviews).values({
        applicationId: app.id,
        checklist: {},
        priceCheck: {},
        status: "pending",
        slaDueAt,
      });
    } else {
      await db
        .update(opsReviews)
        .set({ status: "pending", slaDueAt, updatedAt: new Date() })
        .where(eq(opsReviews.id, existingReview.id));
    }

    await transition({
      db,
      applicationId: app.id,
      to: "UNDER_REVIEW",
      actor,
      customerUserId: actor.userId,
    });

    return { ok: true };
  });
}

export async function getOpsWorkQueue(
  actor: Actor,
  filters?: { status?: string; product?: string; search?: string },
) {
  authorize(actor, "application:read");
  const db = getDb();

  const rows = await db
    .select({
      id: applications.id,
      reference: applications.reference,
      status: applications.status,
      substatus: applications.substatus,
      productCode: applications.productCode,
      financingEligible: applications.financingEligible,
      assignedReviewerId: applications.assignedReviewerId,
      createdAt: applications.createdAt,
      updatedAt: applications.updatedAt,
      customerName: user.name,
      customerPhone: user.phoneNumber,
      regNo: vehicles.regNo,
      makeModel: vehicles.makeModel,
      lenderName: lenders.name,
    })
    .from(applications)
    .innerJoin(customers, eq(applications.customerId, customers.id))
    .innerJoin(user, eq(customers.userId, user.id))
    .leftJoin(vehicles, eq(applications.vehicleId, vehicles.id))
    .leftJoin(lenders, eq(applications.lenderId, lenders.id))
    .orderBy(desc(applications.updatedAt))
    .limit(200);

  const appIds = rows.map((r) => r.id);
  const [reviewRows, scopeRows, assigneeRows] =
    appIds.length > 0
      ? await Promise.all([
          db.select().from(opsReviews).where(inArray(opsReviews.applicationId, appIds)),
          db
            .select()
            .from(scopes)
            .where(inArray(scopes.applicationId, appIds))
            .orderBy(desc(scopes.version)),
          db.select({ id: user.id, name: user.name }).from(user).where(eq(user.kind, "staff")),
        ])
      : [[], [], []];

  const reviewByApp = new Map(reviewRows.map((r) => [r.applicationId, r]));
  const scopeByApp = new Map<string, (typeof scopeRows)[number]>();
  for (const sc of scopeRows) {
    if (!scopeByApp.has(sc.applicationId)) scopeByApp.set(sc.applicationId, sc);
  }
  const staffNameById = new Map(assigneeRows.map((u) => [u.id, u.name]));

  const q = filters?.search?.trim().toLowerCase() ?? "";

  const mapped = rows
    .filter((r) => Boolean(r.reference))
    .map((r) => {
      const review = reviewByApp.get(r.id) ?? null;
      const scope = scopeByApp.get(r.id) ?? null;
      return {
        ...r,
        assigneeName: r.assignedReviewerId ? (staffNameById.get(r.assignedReviewerId) ?? null) : null,
        slaDueAt: review?.slaDueAt ?? null,
        reviewStatus: review?.status ?? null,
        scopeTotalKes: scope?.totalKes ?? null,
        scopeStatus: scope?.status ?? null,
      };
    });

  const filtered = mapped.filter((row) => {
    if (filters?.status && filters.status !== "all" && row.status !== filters.status) return false;
    if (filters?.product && filters.product !== "all" && row.productCode !== filters.product)
      return false;
    if (!q) return true;
    return (
      (row.reference?.toLowerCase().includes(q) ?? false) ||
      row.customerName.toLowerCase().includes(q) ||
      (row.customerPhone?.toLowerCase().includes(q) ?? false) ||
      (row.regNo?.toLowerCase().includes(q) ?? false)
    );
  });

  return filtered;
}

export async function getOpsWorkspaceData(actor: Actor, reference: string) {
  authorize(actor, "application:read");
  const db = getDb();

  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.reference, reference))
    .limit(1);

  if (!app) {
    throw new DomainError("NOT_FOUND", "Application not found.", 404);
  }

  const [
    custRows,
    vehicleRows,
    inspRows,
    scopeRows,
    reviewRows,
    lenderRows,
    schemeRows,
    subRows,
    docRows,
    historyRows,
    checklistDocs,
  ] = await Promise.all([
    db
      .select({
        customerId: customers.id,
        userId: user.id,
        name: user.name,
        email: user.email,
        phoneNumber: user.phoneNumber,
      })
      .from(customers)
      .innerJoin(user, eq(customers.userId, user.id))
      .where(eq(customers.id, app.customerId))
      .limit(1),
    app.vehicleId
      ? db.select().from(vehicles).where(eq(vehicles.id, app.vehicleId)).limit(1)
      : Promise.resolve([]),
    db
      .select()
      .from(inspections)
      .where(eq(inspections.applicationId, app.id))
      .orderBy(desc(inspections.version))
      .limit(1),
    db
      .select()
      .from(scopes)
      .where(eq(scopes.applicationId, app.id))
      .orderBy(desc(scopes.version))
      .limit(1),
    db
      .select()
      .from(opsReviews)
      .where(eq(opsReviews.applicationId, app.id))
      .limit(1),
    app.lenderId
      ? db.select().from(lenders).where(eq(lenders.id, app.lenderId)).limit(1)
      : Promise.resolve([]),
    app.employerSchemeId
      ? db
          .select({
            agreementRef: employerSchemes.agreementRef,
            deductionCapNote: employerSchemes.deductionCapNote,
            employerName: employers.name,
          })
          .from(employerSchemes)
          .innerJoin(employers, eq(employerSchemes.employerId, employers.id))
          .where(eq(employerSchemes.id, app.employerSchemeId))
          .limit(1)
      : Promise.resolve([]),
    db
      .select()
      .from(lenderSubmissions)
      .where(eq(lenderSubmissions.applicationId, app.id))
      .orderBy(desc(lenderSubmissions.packageVersion)),
    db
      .select()
      .from(documents)
      .where(eq(documents.applicationId, app.id))
      .orderBy(desc(documents.createdAt)),
    db.query.statusHistory.findMany({
      where: (sh, { eq: eqOp }) => eqOp(sh.applicationId, app.id),
      orderBy: (sh, { desc: descOp }) => [descOp(sh.createdAt)],
    }),
    getCustomerDocumentsChecklist(app.id),
  ]);

  const latestInspection = inspRows[0] ?? null;
  const latestScope = scopeRows[0] ?? null;

  const [inspFindings, items, uploadRows] = await Promise.all([
    latestInspection
      ? db
          .select()
          .from(findings)
          .where(eq(findings.inspectionId, latestInspection.id))
          .orderBy(asc(findings.seq))
      : Promise.resolve([]),
    latestScope
      ? db
          .select()
          .from(scopeItems)
          .where(eq(scopeItems.scopeId, latestScope.id))
          .orderBy(asc(scopeItems.seq))
      : Promise.resolve([]),
    db
      .select()
      .from(uploads)
      .where(and(eq(uploads.applicationId, app.id), ne(uploads.status, "replaced"))),
  ]);

  // Decrypt optional M-Pesa statement passwords only for authorised ops reviewers
  const uploadPasswords = new Map<string, string>();
  for (const u of uploadRows) {
    if (u.filePasswordEnc) {
      try {
        uploadPasswords.set(u.id, decryptField(u.filePasswordEnc));
      } catch {
        // ignore
      }
    }
  }

  // Fallback server-side lender resolution for RIDE_HAILING if an earlier draft lacked lenderId
  let resolvedLender = lenderRows[0] ?? null;
  if (!resolvedLender && app.productCode === "RIDE_HAILING") {
    const [prodLender] = await db
      .select({ lender: lenders })
      .from(products)
      .innerJoin(lenders, eq(products.fixedLenderId, lenders.id))
      .where(eq(products.code, "RIDE_HAILING"))
      .limit(1);
    if (prodLender?.lender) {
      resolvedLender = prodLender.lender;
    }
  }

  const hasVarianceFlag = items.some((i) => i.varianceFlag);
  const varianceApproved = !hasVarianceFlag || Boolean(latestScope?.approvedBy);
  const allRequiredDocsApproved = checklistDocs
    .filter((d) => d.required)
    .every((d) => d.upload?.status === "approved");
  const opsReview = reviewRows[0] ?? null;
  const opsChecklistPassed = opsReview?.status === "passed";

  const gates = {
    statusIsUnderReview: app.status === "UNDER_REVIEW",
    scopeSigned: latestScope?.status === "signed",
    varianceApproved,
    allRequiredDocsApproved,
    opsChecklistPassed,
    lenderResolved: Boolean(resolvedLender),
  };

  return {
    application: app,
    customer: custRows[0] ?? null,
    vehicle: vehicleRows[0] ?? null,
    inspection: latestInspection,
    findings: inspFindings,
    scope: latestScope,
    scopeItems: items,
    opsReview,
    lender: resolvedLender,
    employerScheme: schemeRows[0] ?? null,
    submissions: subRows,
    documents: docRows,
    history: historyRows,
    checklistDocs: checklistDocs.map((d) => ({
      ...d,
      filePassword: d.upload ? (uploadPasswords.get(d.upload.id) ?? null) : null,
    })),
    gates,
    canForward: Object.values(gates).every(Boolean),
  };
}

export async function claimTaskService(actor: Actor, applicationId: string) {
  authorize(actor, "upload:review");
  if (!actor.userId) throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);

  return withActor(actor, async ({ db }) => {
    await db
      .update(applications)
      .set({ assignedReviewerId: actor.userId, updatedAt: new Date() })
      .where(eq(applications.id, applicationId));

    await audit({
      db,
      actor,
      action: "ops.task_claimed",
      entityType: "application",
      entityId: applicationId,
    });
  });
}

export async function releaseReportAsOpsService(actor: Actor, applicationId: string) {
  authorize(actor, "inspection:release");
  if (!actor.userId) throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);

  return withActor(actor, async ({ db }) => {
    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);
    if (!app) throw new DomainError("NOT_FOUND", "Application not found.", 404);

    const [cust] = await db
      .select({ userId: customers.userId })
      .from(customers)
      .where(eq(customers.id, app.customerId))
      .limit(1);

    const [latestInsp] = await db
      .select()
      .from(inspections)
      .where(eq(inspections.applicationId, app.id))
      .orderBy(desc(inspections.version))
      .limit(1);

    if (!latestInsp) {
      throw new DomainError("VALIDATION_ERROR", "No inspection report found to release.", 400);
    }

    await db
      .update(inspections)
      .set({
        status: "released",
        releasedAt: new Date(),
        releasedBy: actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(inspections.id, latestInsp.id));

    await transition({
      db,
      applicationId: app.id,
      to: "REPORT_READY",
      actor,
      customerUserId: cust?.userId ?? null,
    });
  });
}

export async function returnReportAsOpsService(
  actor: Actor,
  applicationId: string,
  reason: string,
) {
  authorize(actor, "inspection:return");
  if (reason.trim().length < 3) {
    throw new DomainError("VALIDATION_ERROR", "Provide a reason for returning the report.", 400);
  }

  return withActor(actor, async ({ db }) => {
    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);
    if (!app) throw new DomainError("NOT_FOUND", "Application not found.", 404);

    const [latestInsp] = await db
      .select()
      .from(inspections)
      .where(eq(inspections.applicationId, app.id))
      .orderBy(desc(inspections.version))
      .limit(1);

    if (latestInsp) {
      await db
        .update(inspections)
        .set({
          status: "draft",
          returnNotes: reason.trim(),
          updatedAt: new Date(),
        })
        .where(eq(inspections.id, latestInsp.id));
    }

    await transition({
      db,
      applicationId: app.id,
      to: "BOOKED",
      actor,
      reason: reason.trim(),
    });
  });
}

export async function approveScopeVarianceService(actor: Actor, scopeId: string) {
  authorize(actor, "scope:approve_variance");
  if (!actor.userId) throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);

  return withActor(actor, async ({ db }) => {
    const [sc] = await db.select().from(scopes).where(eq(scopes.id, scopeId)).limit(1);
    if (!sc) throw new DomainError("NOT_FOUND", "Scope not found.", 404);

    await db
      .update(scopes)
      .set({ approvedBy: actor.userId, updatedAt: new Date() })
      .where(eq(scopes.id, sc.id));

    await audit({
      db,
      actor,
      action: "scope.variance_approved",
      entityType: "scope",
      entityId: sc.id,
      meta: { applicationId: sc.applicationId },
    });
  });
}

export async function reviewDocumentService(
  actor: Actor,
  input: {
    uploadId: string;
    decision: "approved" | "rejected";
    reasonCode?: string;
    note?: string;
  },
) {
  authorize(actor, "upload:review");
  if (!actor.userId) throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);

  if (input.decision === "rejected" && !input.reasonCode) {
    throw new DomainError("VALIDATION_ERROR", "Select a rejection reason code.", 400);
  }

  return withActor(actor, async ({ db }) => {
    const [uploadRow] = await db
      .select()
      .from(uploads)
      .where(eq(uploads.id, input.uploadId))
      .limit(1);
    if (!uploadRow) throw new DomainError("NOT_FOUND", "Uploaded file not found.", 404);

    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, uploadRow.applicationId))
      .limit(1);
    if (!app) throw new DomainError("NOT_FOUND", "Application not found.", 404);

    const [cust] = await db
      .select({ userId: customers.userId })
      .from(customers)
      .where(eq(customers.id, app.customerId))
      .limit(1);

    const now = new Date();
    await db
      .update(uploads)
      .set({ status: input.decision, updatedAt: now })
      .where(eq(uploads.id, uploadRow.id));

    await db.insert(documentReviews).values({
      uploadId: uploadRow.id,
      reviewerId: actor.userId!,
      decision: input.decision,
      reasonCode: input.decision === "rejected" ? (input.reasonCode ?? null) : null,
      note: input.note?.trim() || null,
      decidedAt: now,
    });

    await audit({
      db,
      actor,
      action: `upload.${input.decision}`,
      entityType: "upload",
      entityId: uploadRow.id,
      meta: {
        applicationId: app.id,
        docType: uploadRow.docType,
        reasonCode: input.reasonCode ?? null,
      },
    });

    if (input.decision === "rejected" && app.status === "UNDER_REVIEW") {
      await transition({
        db,
        applicationId: app.id,
        to: "REPAIR_APPROVED",
        substatus: "docs_in_progress",
        actor,
        reason: input.note?.trim() || input.reasonCode || "Document rejected",
        customerUserId: cust?.userId ?? null,
      });
    }
  });
}

export async function saveOpsChecklistService(
  actor: Actor,
  input: {
    applicationId: string;
    namesMatch: boolean;
    nothingMissing: boolean;
    legible: boolean;
    eligibilityChecked: boolean;
    deductionHeadroomChecked: boolean;
    priceCheckPassed: boolean;
  },
) {
  authorize(actor, "ops_review:complete");
  if (!actor.userId) throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);

  return withActor(actor, async ({ db }) => {
    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .limit(1);
    if (!app) throw new DomainError("NOT_FOUND", "Application not found.", 404);

    const checklistPassed =
      input.namesMatch &&
      input.nothingMissing &&
      input.legible &&
      input.priceCheckPassed &&
      (app.productCode !== "SALARIED" ||
        (input.eligibilityChecked && input.deductionHeadroomChecked));

    const checklist = {
      names_match: input.namesMatch,
      nothing_missing: input.nothingMissing,
      legible: input.legible,
      eligibility_checked: input.eligibilityChecked,
      deduction_headroom_checked: input.deductionHeadroomChecked,
    };
    const priceCheck = {
      passed: input.priceCheckPassed,
      checked_by: actor.userId,
    };
    const now = new Date();

    const [existing] = await db
      .select()
      .from(opsReviews)
      .where(eq(opsReviews.applicationId, app.id))
      .limit(1);

    if (existing) {
      await db
        .update(opsReviews)
        .set({
          checklist,
          priceCheck,
          status: checklistPassed ? "passed" : "pending",
          reviewerId: actor.userId,
          decidedAt: checklistPassed ? now : null,
          updatedAt: now,
        })
        .where(eq(opsReviews.id, existing.id));
    } else {
      await db.insert(opsReviews).values({
        applicationId: app.id,
        checklist,
        priceCheck,
        status: checklistPassed ? "passed" : "pending",
        reviewerId: actor.userId,
        decidedAt: checklistPassed ? now : null,
        slaDueAt: addHours(now, 8),
      });
    }

    await audit({
      db,
      actor,
      action: "ops_review.updated",
      entityType: "application",
      entityId: app.id,
      meta: { checklistPassed },
    });

    return { checklistPassed };
  });
}

export async function forwardToLenderService(actor: Actor, applicationId: string) {
  authorize(actor, "lender_submission:forward");
  if (!actor.userId) throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);

  return withActor(actor, async ({ db }) => {
    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);
    if (!app) throw new DomainError("NOT_FOUND", "Application not found.", 404);
    if (app.status !== "UNDER_REVIEW") {
      throw new DomainError(
        "VALIDATION_ERROR",
        "Application must be in UNDER_REVIEW status before forwarding.",
        400,
      );
    }
    let effectiveLenderId = app.lenderId;
    if (!effectiveLenderId && app.productCode === "RIDE_HAILING") {
      const [prod] = await db
        .select({ fixedLenderId: products.fixedLenderId })
        .from(products)
        .where(eq(products.code, "RIDE_HAILING"))
        .limit(1);
      if (prod?.fixedLenderId) {
        effectiveLenderId = prod.fixedLenderId;
        await db
          .update(applications)
          .set({ lenderId: effectiveLenderId, financingEligible: true, updatedAt: new Date() })
          .where(eq(applications.id, app.id));
      }
    }

    if (!effectiveLenderId) {
      throw new DomainError(
        "VALIDATION_ERROR",
        "No eligible financing partner is assigned to this application.",
        400,
      );
    }

    const [signedScope] = await db
      .select()
      .from(scopes)
      .where(and(eq(scopes.applicationId, app.id), eq(scopes.status, "signed")))
      .orderBy(desc(scopes.version))
      .limit(1);
    if (!signedScope) {
      throw new DomainError("VALIDATION_ERROR", "Customer must sign the repair scope first.", 400);
    }

    const [opsReview] = await db
      .select()
      .from(opsReviews)
      .where(eq(opsReviews.applicationId, app.id))
      .limit(1);
    if (!opsReview || opsReview.status !== "passed") {
      throw new DomainError(
        "VALIDATION_ERROR",
        "Complete and pass the ops checklist and price check before forwarding.",
        400,
      );
    }

    const requiredReqs = await db
      .select()
      .from(productDocumentRequirements)
      .where(
        and(
          eq(productDocumentRequirements.productCode, app.productCode),
          eq(productDocumentRequirements.required, true),
        ),
      );

    const approvedUploads = await db
      .select()
      .from(uploads)
      .where(and(eq(uploads.applicationId, app.id), eq(uploads.status, "approved")));

    const approvedTypes = new Set(approvedUploads.map((u) => u.docType));
    const missingApproved = requiredReqs.filter((r) => !approvedTypes.has(r.docType));
    if (missingApproved.length > 0) {
      throw new DomainError(
        "VALIDATION_ERROR",
        `Every required document must be approved before forwarding (${missingApproved.length} pending).`,
        400,
      );
    }

    const [lender] = await db
      .select()
      .from(lenders)
      .where(eq(lenders.id, effectiveLenderId))
      .limit(1);
    if (!lender) {
      throw new DomainError("VALIDATION_ERROR", "Assigned financing partner not found.", 400);
    }

    const [cust] = await db
      .select({ userId: customers.userId })
      .from(customers)
      .where(eq(customers.id, app.customerId))
      .limit(1);

    const [latestConsent] = await db
      .select()
      .from(consents)
      .where(eq(consents.applicationId, app.id))
      .orderBy(desc(consents.acceptedAt))
      .limit(1);

    const existingSubs = await db
      .select()
      .from(lenderSubmissions)
      .where(eq(lenderSubmissions.applicationId, app.id))
      .orderBy(desc(lenderSubmissions.packageVersion));

    const nextPkgVersion = existingSubs.length === 0 ? 1 : existingSubs[0].packageVersion + 1;
    const financedAmountKes = Math.max(0, signedScope.totalKes - app.depositKes);

    // Generate immutable Request for Financing (RFQ-{ref}) document snapshot
    const rfqDocNumber =
      nextPkgVersion === 1
        ? `RFQ-${app.reference ?? app.id.slice(0, 8)}`
        : `RFQ-${app.reference ?? app.id.slice(0, 8)}-v${nextPkgVersion}`;

    const rfqSnapshot = {
      docNumber: rfqDocNumber,
      applicationReference: app.reference,
      productCode: app.productCode,
      lenderId: lender.id,
      lenderName: lender.name,
      scopeId: signedScope.id,
      scopeTotalKes: signedScope.totalKes,
      depositKes: app.depositKes,
      financedAmountKes,
      forwardedBy: actor.userId,
    };

    const [rfqDoc] = await db
      .insert(documents)
      .values({
        applicationId: app.id,
        type: "request_for_financing",
        docNumber: rfqDocNumber,
        version: nextPkgVersion,
        status: "issued",
        dataSnapshot: rfqSnapshot,
        pdfSha256: sha256Hex(JSON.stringify(rfqSnapshot)),
        issuedAt: new Date(),
        immutable: true,
      })
      .returning();

    const appDocs = await db
      .select()
      .from(documents)
      .where(eq(documents.applicationId, app.id));

    const packageManifest = {
      version: nextPkgVersion,
      generatedAt: new Date().toISOString(),
      financedAmountKes,
      consentId: latestConsent?.id ?? null,
      rfqDocumentId: rfqDoc.id,
      documents: appDocs.map((d) => ({
        id: d.id,
        type: d.type,
        docNumber: d.docNumber,
        sha256: d.pdfSha256,
      })),
      uploads: approvedUploads.map((u) => ({
        id: u.id,
        docType: u.docType,
        sha256: u.sha256,
      })),
    };

    const [submission] = await db
      .insert(lenderSubmissions)
      .values({
        applicationId: app.id,
        lenderId: lender.id,
        packageVersion: nextPkgVersion,
        status: "submitted",
        package: packageManifest,
        submittedBy: actor.userId!,
        submittedAt: new Date(),
        slaDueAt: addHours(new Date(), lender.slaHours),
      })
      .returning();

    await transition({
      db,
      applicationId: app.id,
      to: "WITH_LENDER",
      actor,
      customerUserId: cust?.userId ?? null,
      meta: { submissionId: submission.id, packageVersion: nextPkgVersion },
    });

    return { submissionId: submission.id, packageVersion: nextPkgVersion };
  });
}

export async function moveToCashRouteService(
  actor: Actor,
  applicationId: string,
  reason: string,
) {
  authorize(actor, "ops_review:complete");
  return withActor(actor, async ({ db }) => {
    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);
    if (!app) throw new DomainError("NOT_FOUND", "Application not found.", 404);

    const [cust] = await db
      .select({ userId: customers.userId })
      .from(customers)
      .where(eq(customers.id, app.customerId))
      .limit(1);

    await transition({
      db,
      applicationId: app.id,
      to: "CASH_ROUTE",
      actor,
      reason: reason.trim() || "Moved to cash/deposit route",
      customerUserId: cust?.userId ?? null,
    });
  });
}
