import { addDays, addMonths } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { sha256Hex } from "@/lib/crypto";
import { DomainError } from "@/lib/errors";
import { NAIROBI_TIMEZONE } from "@/lib/format";
import { getDb, type DbOrTx } from "@/server/db/client";
import { SYSTEM_ACTOR, withActor, type Actor } from "@/server/db/rls";
import {
  applications,
  bookings,
  customers,
  documents,
  findings,
  garages,
  inspections,
  jobCardLines,
  jobCards,
  lenderDecisions,
  lenders,
  lenderSubmissions,
  offers,
  paymentAttestations,
  repaymentReports,
  repaymentTerms,
  scopeItems,
  scopes,
  signatures,
  uploads,
  user,
  vehicles,
} from "@/server/db/schema";
import { audit } from "@/server/domain/audit";
import { transition } from "@/server/domain/applications/transition";
import { authorize } from "@/server/policies/can";

export function validateLenderOfferTerms(params: {
  productCode: "RIDE_HAILING" | "SALARIED";
  approvedAmountKes: number;
  installmentKes: number;
  frequency: "daily" | "monthly";
  tenorCount: number;
  validUntil: Date;
  now?: Date;
}): { ok: true; totalPayableKes: number } | { ok: false; message: string } {
  // R5: ride-hailing offers must have daily frequency; salaried offers monthly
  const expectedFreq = params.productCode === "RIDE_HAILING" ? "daily" : "monthly";
  if (params.frequency !== expectedFreq) {
    return {
      ok: false,
      message: `Repayment frequency must be ${expectedFreq} for ${params.productCode} applications.`,
    };
  }
  if (params.approvedAmountKes <= 0) {
    return { ok: false, message: "Approved amount must be greater than zero." };
  }
  if (params.installmentKes <= 0 || params.tenorCount <= 0) {
    return { ok: false, message: "Instalment amount and tenor count must be positive." };
  }
  const totalPayableKes = Math.round(params.installmentKes) * Math.round(params.tenorCount);
  if (totalPayableKes < Math.round(params.approvedAmountKes)) {
    return {
      ok: false,
      message: "Total payable (instalment x tenor) must be at least the approved amount.",
    };
  }
  const now = params.now ?? new Date();
  if (params.validUntil.getTime() <= now.getTime()) {
    return { ok: false, message: "Offer valid-until date must be in the future." };
  }
  return { ok: true, totalPayableKes };
}

export async function listLenderApplicationsService(actor: Actor) {
  authorize(actor, "lender_submission:read", { lenderId: actor.lenderId });
  if (!actor.lenderId) {
    throw new DomainError("FORBIDDEN", "Lender account required.", 403);
  }
  const db = getDb();

  // R7: strictly scoped to actor.lenderId AND having a lender_submissions row
  const subs = await db
    .select({
      submissionId: lenderSubmissions.id,
      packageVersion: lenderSubmissions.packageVersion,
      submissionStatus: lenderSubmissions.status,
      submittedAt: lenderSubmissions.submittedAt,
      slaDueAt: lenderSubmissions.slaDueAt,
      pkg: lenderSubmissions.package,
      applicationId: applications.id,
      reference: applications.reference,
      appStatus: applications.status,
      substatus: applications.substatus,
      productCode: applications.productCode,
      depositKes: applications.depositKes,
      customerName: user.name,
      regNo: vehicles.regNo,
      makeModel: vehicles.makeModel,
    })
    .from(lenderSubmissions)
    .innerJoin(applications, eq(lenderSubmissions.applicationId, applications.id))
    .innerJoin(customers, eq(applications.customerId, customers.id))
    .innerJoin(user, eq(customers.userId, user.id))
    .leftJoin(vehicles, eq(applications.vehicleId, vehicles.id))
    .where(eq(lenderSubmissions.lenderId, actor.lenderId))
    .orderBy(desc(lenderSubmissions.submittedAt))
    .limit(200);

  // Deduplicate to latest package version per application
  const latestByApp = new Map<string, (typeof subs)[number]>();
  for (const row of subs) {
    if (!latestByApp.has(row.applicationId)) {
      latestByApp.set(row.applicationId, row);
    }
  }
  const list = [...latestByApp.values()];

  const appIds = list.map((i) => i.applicationId);
  const [attestationRows, reportRows] =
    appIds.length > 0
      ? await Promise.all([
          db
            .select()
            .from(paymentAttestations)
            .where(inArray(paymentAttestations.applicationId, appIds)),
          db
            .select()
            .from(repaymentReports)
            .where(inArray(repaymentReports.applicationId, appIds))
            .orderBy(desc(repaymentReports.asOfDate), desc(repaymentReports.createdAt)),
        ])
      : [[], []];

  const hasLenderApprovalSet = new Set(
    attestationRows.filter((a) => a.kind === "lender_approval").map((a) => a.applicationId),
  );
  const latestRepaymentByApp = new Map<string, (typeof reportRows)[number]>();
  for (const rep of reportRows) {
    if (!latestRepaymentByApp.has(rep.applicationId)) {
      latestRepaymentByApp.set(rep.applicationId, rep);
    }
  }

  const nowMs = Date.now();
  return list.map((row) => {
    const pkgData = (row.pkg ?? {}) as Record<string, unknown>;
    const financedAmountKes =
      typeof pkgData.financedAmountKes === "number" ? pkgData.financedAmountKes : null;
    const latestRep = latestRepaymentByApp.get(row.applicationId) ?? null;

    return {
      ...row,
      financedAmountKes,
      hasLenderApproval: hasLenderApprovalSet.has(row.applicationId),
      repaymentState: latestRep?.state ?? null,
      slaBreached: row.slaDueAt ? row.slaDueAt.getTime() < nowMs : false,
    };
  });
}

export async function getLenderDashboardData(actor: Actor) {
  const rows = await listLenderApplicationsService(actor);
  return {
    counts: {
      inboxCount: rows.filter((r) => r.appStatus === "WITH_LENDER").length,
      offersPendingCount: rows.filter((r) => r.appStatus === "OFFER_MADE").length,
      awaitingPaymentApprovalCount: rows.filter(
        (r) => r.appStatus === "APPROVED" && !r.hasLenderApproval,
      ).length,
      repairInProgressCount: rows.filter((r) => r.appStatus === "REPAIR_IN_PROGRESS").length,
      repayingCount: rows.filter((r) => r.appStatus === "REPAYING").length,
      settledCount: rows.filter((r) => r.appStatus === "SETTLED").length,
    },
    repaymentSummary: {
      current: rows.filter((r) => r.repaymentState === "current").length,
      catchUp: rows.filter((r) => r.repaymentState === "catch_up").length,
      arrears: rows.filter((r) => r.repaymentState === "arrears").length,
      settled: rows.filter((r) => r.repaymentState === "settled" || r.appStatus === "SETTLED").length,
    },
    rows,
  };
}

export async function getLenderApplicationPackage(actor: Actor, reference: string) {
  if (!actor.lenderId) {
    throw new DomainError("FORBIDDEN", "Lender account required.", 403);
  }
  const db = getDb();

  const [app] = await db
    .select()
    .from(applications)
    .where(and(eq(applications.reference, reference), eq(applications.lenderId, actor.lenderId)))
    .limit(1);

  if (!app) {
    throw new DomainError("NOT_FOUND", "Application not found.", 404);
  }

  const subs = await db
    .select()
    .from(lenderSubmissions)
    .where(
      and(
        eq(lenderSubmissions.applicationId, app.id),
        eq(lenderSubmissions.lenderId, actor.lenderId),
      ),
    )
    .orderBy(desc(lenderSubmissions.packageVersion));

  const latestSubmission = subs[0];
  if (!latestSubmission) {
    throw new DomainError("NOT_FOUND", "No submitted package found for this application.", 404);
  }

  authorize(actor, "application:read", {
    lenderId: app.lenderId,
    hasLenderSubmission: true,
  });

  // R12: audit every lender package view
  await audit({
    db,
    actor,
    action: "lender.package_viewed",
    entityType: "application",
    entityId: app.id,
    meta: { reference, packageVersion: latestSubmission.packageVersion },
  });

  const [
    lenderRow,
    custRow,
    vehicleRow,
    docRows,
    uploadRows,
    scopeRows,
    inspRows,
    decisionRows,
    offerRows,
    termsRows,
    attestationRows,
    reportRows,
    historyRows,
  ] = await Promise.all([
    db.select().from(lenders).where(eq(lenders.id, actor.lenderId)).limit(1),
    db
      .select({ name: user.name, email: user.email, phoneNumber: user.phoneNumber })
      .from(customers)
      .innerJoin(user, eq(customers.userId, user.id))
      .where(eq(customers.id, app.customerId))
      .limit(1),
    app.vehicleId
      ? db.select().from(vehicles).where(eq(vehicles.id, app.vehicleId)).limit(1)
      : Promise.resolve([]),
    db
      .select()
      .from(documents)
      .where(eq(documents.applicationId, app.id))
      .orderBy(desc(documents.createdAt)),
    db
      .select()
      .from(uploads)
      .where(and(eq(uploads.applicationId, app.id), eq(uploads.status, "approved"))),
    db
      .select()
      .from(scopes)
      .where(and(eq(scopes.applicationId, app.id), eq(scopes.status, "signed")))
      .orderBy(desc(scopes.version))
      .limit(1),
    db
      .select()
      .from(inspections)
      .where(eq(inspections.applicationId, app.id))
      .orderBy(desc(inspections.version))
      .limit(1),
    db
      .select()
      .from(lenderDecisions)
      .where(eq(lenderDecisions.submissionId, latestSubmission.id))
      .orderBy(desc(lenderDecisions.createdAt)),
    db
      .select()
      .from(offers)
      .where(eq(offers.applicationId, app.id))
      .orderBy(desc(offers.createdAt))
      .limit(1),
    db
      .select()
      .from(repaymentTerms)
      .where(eq(repaymentTerms.applicationId, app.id))
      .limit(1),
    db
      .select()
      .from(paymentAttestations)
      .where(eq(paymentAttestations.applicationId, app.id)),
    db
      .select()
      .from(repaymentReports)
      .where(eq(repaymentReports.applicationId, app.id))
      .orderBy(desc(repaymentReports.asOfDate), desc(repaymentReports.createdAt)),
    db.query.statusHistory.findMany({
      where: (sh, { eq: eqOp }) => eqOp(sh.applicationId, app.id),
      orderBy: (sh, { desc: descOp }) => [descOp(sh.createdAt)],
    }),
  ]);

  const signedScope = scopeRows[0] ?? null;
  const latestInsp = inspRows[0] ?? null;

  const [signedScopeItems, inspFindings] = await Promise.all([
    signedScope
      ? db.select().from(scopeItems).where(eq(scopeItems.scopeId, signedScope.id)).orderBy(asc(scopeItems.seq))
      : Promise.resolve([]),
    latestInsp
      ? db.select().from(findings).where(eq(findings.inspectionId, latestInsp.id)).orderBy(asc(findings.seq))
      : Promise.resolve([]),
  ]);

  const financedAmountKes = signedScope
    ? Math.max(0, signedScope.totalKes - app.depositKes)
    : 0;

  return {
    lender: lenderRow[0] ?? null,
    application: app,
    submission: latestSubmission,
    customer: custRow[0] ?? null,
    vehicle: vehicleRow[0] ?? null,
    documents: docRows,
    approvedUploads: uploadRows,
    signedScope,
    signedScopeItems,
    findings: inspFindings,
    financedAmountKes,
    decisions: decisionRows,
    latestOffer: offerRows[0] ?? null,
    repaymentTerms: termsRows[0] ?? null,
    attestations: attestationRows,
    repaymentReports: reportRows,
    history: historyRows,
  };
}

export async function decideSubmissionService(
  actor: Actor,
  input: {
    submissionId: string;
    decision: "approve" | "decline" | "request_info";
    approvedAmountKes?: number;
    installmentKes?: number;
    frequency?: "daily" | "monthly";
    tenorCount?: number;
    rateText?: string;
    feesText?: string;
    validUntilIso?: string;
    declineReasonCode?: string;
    note?: string;
  },
) {
  if (!actor.userId || !actor.lenderId) {
    throw new DomainError("FORBIDDEN", "Lender approver account required.", 403);
  }
  authorize(actor, "lender_submission:decide", { lenderId: actor.lenderId });

  return withActor(actor, async ({ db }) => {
    const [sub] = await db
      .select()
      .from(lenderSubmissions)
      .where(
        and(
          eq(lenderSubmissions.id, input.submissionId),
          eq(lenderSubmissions.lenderId, actor.lenderId!),
        ),
      )
      .limit(1);

    if (!sub) {
      throw new DomainError("NOT_FOUND", "Submission not found.", 404);
    }

    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, sub.applicationId))
      .limit(1);
    if (!app || app.status !== "WITH_LENDER") {
      throw new DomainError(
        "VALIDATION_ERROR",
        "Application is not currently awaiting a lender decision.",
        400,
      );
    }

    const [cust] = await db
      .select({ userId: customers.userId })
      .from(customers)
      .where(eq(customers.id, app.customerId))
      .limit(1);

    const now = new Date();

    if (input.decision === "approve") {
      const validUntil = input.validUntilIso ? new Date(input.validUntilIso) : addDays(now, 7);
      const validation = validateLenderOfferTerms({
        productCode: app.productCode,
        approvedAmountKes: input.approvedAmountKes ?? 0,
        installmentKes: input.installmentKes ?? 0,
        frequency: input.frequency ?? (app.productCode === "RIDE_HAILING" ? "daily" : "monthly"),
        tenorCount: input.tenorCount ?? 0,
        validUntil,
        now,
      });

      if (!validation.ok) {
        throw new DomainError("VALIDATION_ERROR", validation.message, 400);
      }

      const [decisionRow] = await db
        .insert(lenderDecisions)
        .values({
          submissionId: sub.id,
          decidedBy: actor.userId!,
          decision: "approve",
          approvedAmountKes: Math.round(input.approvedAmountKes!),
          installmentKes: Math.round(input.installmentKes!),
          frequency: input.frequency ?? (app.productCode === "RIDE_HAILING" ? "daily" : "monthly"),
          tenorCount: Math.round(input.tenorCount!),
          rateText: input.rateText?.trim() || null,
          feesText: input.feesText?.trim() || null,
          totalPayableKes: validation.totalPayableKes,
          note: input.note?.trim() || null,
          validUntil,
        })
        .returning();

      await db.insert(offers).values({
        applicationId: app.id,
        decisionId: decisionRow.id,
        customerResponse: "pending",
      });

      await db
        .update(lenderSubmissions)
        .set({ status: "approved", updatedAt: now })
        .where(eq(lenderSubmissions.id, sub.id));

      await transition({
        db,
        applicationId: app.id,
        to: "OFFER_MADE",
        actor,
        customerUserId: cust?.userId ?? null,
        meta: {
          decisionId: decisionRow.id,
          approvedAmountKes: decisionRow.approvedAmountKes,
          installmentKes: decisionRow.installmentKes,
        },
      });

      return { decisionId: decisionRow.id };
    }

    if (input.decision === "decline") {
      if (!input.declineReasonCode) {
        throw new DomainError("VALIDATION_ERROR", "Select a decline reason code.", 400);
      }

      const [decisionRow] = await db
        .insert(lenderDecisions)
        .values({
          submissionId: sub.id,
          decidedBy: actor.userId!,
          decision: "decline",
          declineReasonCode: input.declineReasonCode,
          note: input.note?.trim() || null,
        })
        .returning();

      await db
        .update(lenderSubmissions)
        .set({ status: "declined", updatedAt: now })
        .where(eq(lenderSubmissions.id, sub.id));

      await transition({
        db,
        applicationId: app.id,
        to: "DECLINED",
        actor,
        reason: input.note?.trim() || input.declineReasonCode,
        customerUserId: cust?.userId ?? null,
        meta: { decisionId: decisionRow.id },
      });

      return { decisionId: decisionRow.id };
    }

    // request_info
    if (!input.note || input.note.trim().length < 3) {
      throw new DomainError("VALIDATION_ERROR", "Specify the missing information needed.", 400);
    }

    const [decisionRow] = await db
      .insert(lenderDecisions)
      .values({
        submissionId: sub.id,
        decidedBy: actor.userId!,
        decision: "request_info",
        note: input.note.trim(),
      })
      .returning();

    await db
      .update(lenderSubmissions)
      .set({ status: "info_requested", updatedAt: now })
      .where(eq(lenderSubmissions.id, sub.id));

    await transition({
      db,
      applicationId: app.id,
      to: "WITH_LENDER",
      substatus: "info_requested",
      actor,
      reason: input.note.trim(),
      customerUserId: cust?.userId ?? null,
      meta: { decisionId: decisionRow.id },
    });

    return { decisionId: decisionRow.id };
  });
}

export async function getCustomerOfferData(applicationId: string) {
  const db = getDb();
  const [offerRow] = await db
    .select({
      offer: offers,
      decision: lenderDecisions,
    })
    .from(offers)
    .innerJoin(lenderDecisions, eq(offers.decisionId, lenderDecisions.id))
    .where(eq(offers.applicationId, applicationId))
    .orderBy(desc(offers.createdAt))
    .limit(1);

  return offerRow ?? null;
}

export async function customerRespondToOfferService(
  actor: Actor,
  input: {
    applicationId: string;
    offerId: string;
    response: "accepted" | "declined";
    typedName?: string;
  },
) {
  if (!actor.userId || !actor.customerId) {
    throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);
  }

  return withActor(actor, async ({ db }) => {
    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .limit(1);
    if (!app) throw new DomainError("NOT_FOUND", "Application not found.", 404);
    authorize(actor, "offer:respond", { customerId: app.customerId });

    if (app.status !== "OFFER_MADE") {
      throw new DomainError("VALIDATION_ERROR", "No pending offer is awaiting your response.", 400);
    }

    const [row] = await db
      .select({ offer: offers, decision: lenderDecisions })
      .from(offers)
      .innerJoin(lenderDecisions, eq(offers.decisionId, lenderDecisions.id))
      .where(and(eq(offers.id, input.offerId), eq(offers.applicationId, app.id)))
      .limit(1);

    if (!row || row.offer.customerResponse !== "pending") {
      throw new DomainError("VALIDATION_ERROR", "Offer has already been answered.", 400);
    }

    const now = new Date();
    if (input.response === "declined") {
      await db
        .update(offers)
        .set({ customerResponse: "declined", respondedAt: now, updatedAt: now })
        .where(eq(offers.id, row.offer.id));

      await transition({
        db,
        applicationId: app.id,
        to: "DECLINED",
        actor,
        reason: "Customer declined financing offer",
        customerUserId: actor.userId,
      });
      return { status: "DECLINED" as const };
    }

    if (row.decision.validUntil && row.decision.validUntil.getTime() < now.getTime()) {
      throw new DomainError("VALIDATION_ERROR", "This offer has expired.", 400);
    }
    if (!input.typedName || input.typedName.trim().length < 2) {
      throw new DomainError("VALIDATION_ERROR", "Enter your full name to accept the offer.", 400);
    }

    const offerSnapshot = {
      offerId: row.offer.id,
      decisionId: row.decision.id,
      approvedAmountKes: row.decision.approvedAmountKes,
      installmentKes: row.decision.installmentKes,
      frequency: row.decision.frequency,
      tenorCount: row.decision.tenorCount,
      totalPayableKes: row.decision.totalPayableKes,
      acceptedBy: input.typedName.trim(),
    };
    const hash = sha256Hex(JSON.stringify(offerSnapshot));

    const [offerDoc] = await db
      .insert(documents)
      .values({
        applicationId: app.id,
        type: "lender_offer",
        docNumber: `OFR-${app.reference ?? app.id.slice(0, 8)}-${Date.now().toString().slice(-4)}`,
        version: 1,
        status: "issued",
        dataSnapshot: offerSnapshot,
        pdfSha256: hash,
        issuedAt: now,
        immutable: true,
      })
      .returning();

    const [sig] = await db
      .insert(signatures)
      .values({
        userId: actor.userId!,
        documentId: offerDoc.id,
        method: "otp_confirm",
        otpVerifiedAt: now,
        typedName: input.typedName.trim(),
        ip: actor.ip ?? null,
        userAgent: actor.userAgent ?? null,
        documentSha256: hash,
        signedAt: now,
      })
      .returning();

    await db
      .update(offers)
      .set({
        customerResponse: "accepted",
        respondedAt: now,
        signatureId: sig.id,
        updatedAt: now,
      })
      .where(eq(offers.id, row.offer.id));

    const freq = row.decision.frequency ?? (app.productCode === "RIDE_HAILING" ? "daily" : "monthly");
    const firstDue = freq === "daily" ? addDays(now, 1) : addMonths(now, 1);

    await db
      .insert(repaymentTerms)
      .values({
        applicationId: app.id,
        frequency: freq,
        installmentKes: row.decision.installmentKes ?? 0,
        tenorCount: row.decision.tenorCount ?? 1,
        firstDueDate: formatInTimeZone(firstDue, NAIROBI_TIMEZONE, "yyyy-MM-dd"),
        totalPayableKes: row.decision.totalPayableKes ?? 0,
      })
      .onConflictDoNothing({ target: repaymentTerms.applicationId });

    await transition({
      db,
      applicationId: app.id,
      to: "APPROVED",
      actor,
      customerUserId: actor.userId,
      meta: { offerId: row.offer.id, signatureId: sig.id },
    });

    return { status: "APPROVED" as const };
  });
}

async function tryTriggerPaymentGateAndOpenJobCard(db: DbOrTx, applicationId: string) {
  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!app || app.status !== "APPROVED") return false;

  const attestations = await db
    .select()
    .from(paymentAttestations)
    .where(eq(paymentAttestations.applicationId, applicationId));

  const approval = attestations.find((a) => a.kind === "lender_approval");
  const funds = attestations.find((a) => a.kind === "funds_received");
  if (!approval || !funds) return false;

  // Check maker-checker threshold if configured on the lender
  if (app.lenderId) {
    const [lender] = await db.select().from(lenders).where(eq(lenders.id, app.lenderId)).limit(1);
    if (
      lender?.makerCheckerThresholdKes &&
      approval.amountKes > lender.makerCheckerThresholdKes &&
      !approval.secondApproverId
    ) {
      return false;
    }
  }

  const [cust] = await db
    .select({ userId: customers.userId })
    .from(customers)
    .where(eq(customers.id, app.customerId))
    .limit(1);

  // R4 & R10: transition APPROVED -> REPAIR_IN_PROGRESS and open Job Card
  await transition({
    db,
    applicationId,
    to: "REPAIR_IN_PROGRESS",
    actor: SYSTEM_ACTOR,
    customerUserId: cust?.userId ?? null,
    meta: { lenderApprovalId: approval.id, fundsReceivedId: funds.id },
  });

  const [existingJob] = await db
    .select({ id: jobCards.id })
    .from(jobCards)
    .where(eq(jobCards.applicationId, applicationId))
    .limit(1);

  if (!existingJob) {
    const [booking] = await db
      .select({ garageId: bookings.garageId })
      .from(bookings)
      .where(eq(bookings.applicationId, applicationId))
      .orderBy(desc(bookings.createdAt))
      .limit(1);

    let garageId = booking?.garageId ?? null;
    if (!garageId) {
      const [g] = await db.select({ id: garages.id }).from(garages).limit(1);
      garageId = g?.id ?? null;
    }

    if (garageId) {
      const [job] = await db
        .insert(jobCards)
        .values({
          applicationId,
          garageId,
          status: "opened",
        } as typeof jobCards.$inferInsert)
        .returning();

      const [signedScope] = await db
        .select()
        .from(scopes)
        .where(and(eq(scopes.applicationId, applicationId), eq(scopes.status, "signed")))
        .orderBy(desc(scopes.version))
        .limit(1);

      if (signedScope && job) {
        const approvedLines = await db
          .select()
          .from(scopeItems)
          .where(and(eq(scopeItems.scopeId, signedScope.id), eq(scopeItems.decision, "approved")))
          .orderBy(asc(scopeItems.seq));

        if (approvedLines.length > 0) {
          await db.insert(jobCardLines).values(
            approvedLines.map((line) => ({
              jobCardId: job.id,
              scopeItemId: line.id,
              grade: line.partGrade,
            })),
          );
        }
      }
    }
  }

  return true;
}

export async function recordLenderApprovalService(
  actor: Actor,
  input: {
    applicationId: string;
    amountKes: number;
    reference: string;
    expectedDate: string;
  },
) {
  if (!actor.userId || !actor.lenderId) {
    throw new DomainError("FORBIDDEN", "Lender approver required.", 403);
  }
  authorize(actor, "attestation:record_lender_approval", { lenderId: actor.lenderId });

  return withActor(actor, async ({ db }) => {
    const [app] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.id, input.applicationId), eq(applications.lenderId, actor.lenderId!)))
      .limit(1);
    if (!app || app.status !== "APPROVED") {
      throw new DomainError(
        "VALIDATION_ERROR",
        "Payment approval can only be recorded after the customer accepts the offer.",
        400,
      );
    }

    const [created] = await db
      .insert(paymentAttestations)
      .values({
        applicationId: app.id,
        kind: "lender_approval",
        amountKes: Math.round(input.amountKes),
        reference: input.reference.trim(),
        expectedDate: input.expectedDate,
        recordedBy: actor.userId!,
      })
      .onConflictDoNothing({
        target: [paymentAttestations.applicationId, paymentAttestations.kind],
      })
      .returning();

    if (!created) {
      throw new DomainError("CONFLICT", "Payment approval has already been recorded.", 409);
    }

    await audit({
      db,
      actor,
      action: "attestation.lender_approval_recorded",
      entityType: "payment_attestation",
      entityId: created.id,
      meta: { applicationId: app.id, amountKes: created.amountKes },
    });

    const gateOpened = await tryTriggerPaymentGateAndOpenJobCard(db, app.id);
    return { attestationId: created.id, gateOpened };
  });
}

export async function confirmSecondApprovalService(actor: Actor, attestationId: string) {
  if (!actor.userId || !actor.lenderId) {
    throw new DomainError("FORBIDDEN", "Lender approver required.", 403);
  }
  authorize(actor, "attestation:record_lender_approval", { lenderId: actor.lenderId });

  return withActor(actor, async ({ db }) => {
    const [att] = await db
      .select()
      .from(paymentAttestations)
      .where(eq(paymentAttestations.id, attestationId))
      .limit(1);
    if (!att || att.kind !== "lender_approval") {
      throw new DomainError("NOT_FOUND", "Payment approval record not found.", 404);
    }
    if (att.recordedBy === actor.userId) {
      throw new DomainError(
        "FORBIDDEN",
        "A different approver must provide second-person confirmation.",
        403,
      );
    }

    await db
      .update(paymentAttestations)
      .set({ secondApproverId: actor.userId, updatedAt: new Date() })
      .where(eq(paymentAttestations.id, att.id));

    await audit({
      db,
      actor,
      action: "attestation.second_approval_confirmed",
      entityType: "payment_attestation",
      entityId: att.id,
    });

    const gateOpened = await tryTriggerPaymentGateAndOpenJobCard(db, att.applicationId);
    return { gateOpened };
  });
}

export async function recordFundsReceivedService(
  actor: Actor,
  input: {
    applicationId: string;
    amountKes: number;
    reference: string;
    receivedDate: string;
  },
) {
  authorize(actor, "attestation:record_funds_received");
  if (!actor.userId) throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);

  return withActor(actor, async ({ db }) => {
    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .limit(1);
    if (!app || app.status !== "APPROVED") {
      throw new DomainError("VALIDATION_ERROR", "Application must be in APPROVED status.", 400);
    }

    const [lenderApproval] = await db
      .select()
      .from(paymentAttestations)
      .where(
        and(
          eq(paymentAttestations.applicationId, app.id),
          eq(paymentAttestations.kind, "lender_approval"),
        ),
      )
      .limit(1);

    const amountKes = Math.round(input.amountKes);
    const discrepancyFlag = Boolean(lenderApproval && lenderApproval.amountKes !== amountKes);

    const [created] = await db
      .insert(paymentAttestations)
      .values({
        applicationId: app.id,
        kind: "funds_received",
        amountKes,
        reference: input.reference.trim(),
        expectedDate: input.receivedDate,
        discrepancyFlag,
        recordedBy: actor.userId!,
      })
      .onConflictDoNothing({
        target: [paymentAttestations.applicationId, paymentAttestations.kind],
      })
      .returning();

    if (!created) {
      throw new DomainError("CONFLICT", "Receipt of funds has already been recorded.", 409);
    }

    await audit({
      db,
      actor,
      action: "attestation.funds_received_recorded",
      entityType: "payment_attestation",
      entityId: created.id,
      meta: { applicationId: app.id, amountKes, discrepancyFlag },
    });

    const gateOpened = await tryTriggerPaymentGateAndOpenJobCard(db, app.id);
    return { attestationId: created.id, discrepancyFlag, gateOpened };
  });
}

export async function submitRepaymentReportService(
  actor: Actor,
  input: {
    reference: string;
    asOfDate: string;
    state: "current" | "catch_up" | "arrears" | "settled";
    installmentsPaid: number;
    installmentsMissed: number;
    note?: string;
    source: "manual" | "csv";
    batchId?: string;
  },
) {
  if (!actor.userId || !actor.lenderId) {
    throw new DomainError("FORBIDDEN", "Lender account required.", 403);
  }
  authorize(actor, "repayment:report", { lenderId: actor.lenderId });

  return withActor(actor, async ({ db }) => {
    const [app] = await db
      .select()
      .from(applications)
      .where(
        and(eq(applications.reference, input.reference.trim()), eq(applications.lenderId, actor.lenderId!)),
      )
      .limit(1);

    if (!app) {
      throw new DomainError("NOT_FOUND", `Application ${input.reference} not found for your organisation.`, 404);
    }

    const [report] = await db
      .insert(repaymentReports)
      .values({
        applicationId: app.id,
        asOfDate: input.asOfDate,
        state: input.state,
        installmentsPaid: Math.max(0, Math.round(input.installmentsPaid)),
        installmentsMissed: Math.max(0, Math.round(input.installmentsMissed)),
        note: input.note?.trim() || null,
        source: input.source,
        batchId: input.batchId ?? null,
        reportedBy: actor.userId!,
      })
      .returning();

    if (input.state === "settled" && app.status === "REPAYING") {
      const [cust] = await db
        .select({ userId: customers.userId })
        .from(customers)
        .where(eq(customers.id, app.customerId))
        .limit(1);

      await transition({
        db,
        applicationId: app.id,
        to: "SETTLED",
        actor,
        customerUserId: cust?.userId ?? null,
        meta: { reportId: report.id },
      });
    }

    return report;
  });
}

export async function uploadRepaymentCsvService(actor: Actor, csvText: string) {
  if (!actor.userId || !actor.lenderId) {
    throw new DomainError("FORBIDDEN", "Lender account required.", 403);
  }
  authorize(actor, "repayment:report", { lenderId: actor.lenderId });

  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new DomainError("VALIDATION_ERROR", "CSV must include a header row and at least one data row.", 400);
  }

  const batchId = uuidv7();
  const validStates = new Set(["current", "catch_up", "arrears", "settled"]);
  const errors: Array<{ row: number; error: string }> = [];
  let imported = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const [reference, asOfDate, state, paidStr, missedStr, note] = cols;
    if (!reference || !asOfDate || !state || !validStates.has(state)) {
      errors.push({
        row: i + 1,
        error: "Invalid reference, date (YYYY-MM-DD), or state (current|catch_up|arrears|settled).",
      });
      continue;
    }

    try {
      await submitRepaymentReportService(actor, {
        reference,
        asOfDate,
        state: state as "current" | "catch_up" | "arrears" | "settled",
        installmentsPaid: Number.parseInt(paidStr ?? "0", 10) || 0,
        installmentsMissed: Number.parseInt(missedStr ?? "0", 10) || 0,
        note: note || undefined,
        source: "csv",
        batchId,
      });
      imported++;
    } catch (err) {
      errors.push({
        row: i + 1,
        error: err instanceof Error ? err.message : "Failed to import row.",
      });
    }
  }

  return { batchId, imported, errors };
}

export async function listApplicationsAwaitingFunds() {
  const db = getDb();
  const approvedApps = await db
    .select({
      id: applications.id,
      reference: applications.reference,
      productCode: applications.productCode,
      customerName: user.name,
      lenderName: lenders.name,
      regNo: vehicles.regNo,
    })
    .from(applications)
    .innerJoin(customers, eq(applications.customerId, customers.id))
    .innerJoin(user, eq(customers.userId, user.id))
    .leftJoin(lenders, eq(applications.lenderId, lenders.id))
    .leftJoin(vehicles, eq(applications.vehicleId, vehicles.id))
    .where(eq(applications.status, "APPROVED"))
    .orderBy(desc(applications.updatedAt));

  const appIds = approvedApps.map((a) => a.id);
  const attestations =
    appIds.length > 0
      ? await db
          .select()
          .from(paymentAttestations)
          .where(inArray(paymentAttestations.applicationId, appIds))
      : [];

  return approvedApps.map((a) => {
    const appAtt = attestations.filter((x) => x.applicationId === a.id);
    return {
      ...a,
      lenderApproval: appAtt.find((x) => x.kind === "lender_approval") ?? null,
      fundsReceived: appAtt.find((x) => x.kind === "funds_received") ?? null,
    };
  });
}
