import { asc, desc, eq, inArray } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { sha256Hex } from "@/lib/crypto";
import { DomainError } from "@/lib/errors";
import { getDb, type DbOrTx } from "@/server/db/client";
import { withActor, type Actor } from "@/server/db/rls";
import {
  applications,
  customers,
  documents,
  garages,
  handovers,
  jobCardLines,
  jobCardPhotos,
  jobCards,
  paymentAttestations,
  recommendations,
  scopeItems,
  signatures,
  user,
  vehicles,
} from "@/server/db/schema";
import { audit } from "@/server/domain/audit";
import { transition } from "@/server/domain/applications/transition";
import { putPrivateObject } from "@/server/integrations/storage";
import { authorize } from "@/server/policies/can";

export type RecommendationUrgency = (typeof recommendations.$inferInsert)["urgency"];
export type PhotoKind = "before" | "after" | "old_parts" | "alignment";

export function validateHandoverReadiness(params: {
  totalLines: number;
  completedLines: number;
  mileageIn: number | null;
  mileageOut: number;
}): { ok: true } | { ok: false; message: string } {
  if (params.totalLines > 0 && params.completedLines < params.totalLines) {
    return {
      ok: false,
      message: `Complete all ${params.totalLines} approved repair lines before recording handover (${params.completedLines} completed).`,
    };
  }
  if (params.mileageOut <= 0) {
    return { ok: false, message: "Enter a valid mileage-out reading." };
  }
  if (params.mileageIn !== null && params.mileageOut < params.mileageIn) {
    return {
      ok: false,
      message: "Mileage out cannot be lower than mileage in.",
    };
  }
  return { ok: true };
}

async function checkBothAttestations(db: DbOrTx, applicationId: string): Promise<boolean> {
  const rows = await db
    .select({ kind: paymentAttestations.kind })
    .from(paymentAttestations)
    .where(eq(paymentAttestations.applicationId, applicationId));
  return (
    rows.some((r) => r.kind === "lender_approval") &&
    rows.some((r) => r.kind === "funds_received")
  );
}

export async function listGarageJobsService(actor: Actor) {
  authorize(actor, "job_card:read");
  const db = getDb();

  const isPureGarage =
    actor.roles.includes("garage") &&
    !actor.roles.includes("admin") &&
    !actor.roles.includes("ops_reviewer") &&
    !actor.roles.includes("ops_approver");

  const rows = await db
    .select({
      jobId: jobCards.id,
      jobNo: jobCards.jobNo,
      jobStatus: jobCards.status,
      garageId: jobCards.garageId,
      garageName: garages.name,
      garageBranch: garages.branchName,
      mileageIn: jobCards.mileageIn,
      mileageOut: jobCards.mileageOut,
      openedAt: jobCards.openedAt,
      completedAt: jobCards.completedAt,
      applicationId: applications.id,
      reference: applications.reference,
      appStatus: applications.status,
      customerName: user.name,
      customerPhone: user.phoneNumber,
      regNo: vehicles.regNo,
      makeModel: vehicles.makeModel,
      year: vehicles.year,
    })
    .from(jobCards)
    .innerJoin(applications, eq(jobCards.applicationId, applications.id))
    .innerJoin(customers, eq(applications.customerId, customers.id))
    .innerJoin(user, eq(customers.userId, user.id))
    .innerJoin(garages, eq(jobCards.garageId, garages.id))
    .leftJoin(vehicles, eq(applications.vehicleId, vehicles.id))
    .where(isPureGarage && actor.garageId ? eq(jobCards.garageId, actor.garageId) : undefined)
    .orderBy(desc(jobCards.openedAt))
    .limit(100);

  const jobIds = rows.map((r) => r.jobId);
  const appIds = rows.map((r) => r.applicationId);

  const [lines, handoverRows] =
    jobIds.length > 0
      ? await Promise.all([
          db
            .select({
              jobCardId: jobCardLines.jobCardId,
              completedAt: jobCardLines.completedAt,
            })
            .from(jobCardLines)
            .where(inArray(jobCardLines.jobCardId, jobIds)),
          db
            .select({
              applicationId: handovers.applicationId,
              handedOverAt: handovers.handedOverAt,
              walkthroughDone: handovers.walkthroughDone,
            })
            .from(handovers)
            .where(inArray(handovers.applicationId, appIds)),
        ])
      : [[], []];

  const lineStats = new Map<string, { total: number; completed: number }>();
  for (const line of lines) {
    const cur = lineStats.get(line.jobCardId) ?? { total: 0, completed: 0 };
    cur.total++;
    if (line.completedAt) cur.completed++;
    lineStats.set(line.jobCardId, cur);
  }

  const handoverByApp = new Map(handoverRows.map((h) => [h.applicationId, h]));

  const jobs = rows.map((r) => {
    const stats = lineStats.get(r.jobId) ?? { total: 0, completed: 0 };
    const ho = handoverByApp.get(r.applicationId) ?? null;
    return {
      ...r,
      totalLines: stats.total,
      completedLines: stats.completed,
      handoverReady: Boolean(ho && !ho.handedOverAt),
      handedOverAt: ho?.handedOverAt ?? null,
    };
  });

  return {
    counts: {
      opened: jobs.filter((j) => j.jobStatus === "opened").length,
      inProgress: jobs.filter((j) => j.jobStatus === "in_progress" && !j.handoverReady).length,
      awaitingHandover: jobs.filter((j) => j.jobStatus !== "completed" && j.handoverReady).length,
      completed: jobs.filter((j) => j.jobStatus === "completed").length,
    },
    jobs,
  };
}

export async function getGarageJobDetailService(actor: Actor, jobId: string) {
  const db = getDb();

  const [job] = await db.select().from(jobCards).where(eq(jobCards.id, jobId)).limit(1);
  if (!job) {
    throw new DomainError("NOT_FOUND", "Job card not found.", 404);
  }

  const bothAttestationsPresent = await checkBothAttestations(db, job.applicationId);
  authorize(actor, "job_card:read", {
    garageId: job.garageId,
    bothAttestationsPresent,
  });

  const [app] = await db
    .select({
      id: applications.id,
      reference: applications.reference,
      status: applications.status,
      faultDescription: applications.faultDescription,
      customerId: applications.customerId,
      vehicleId: applications.vehicleId,
    })
    .from(applications)
    .where(eq(applications.id, job.applicationId))
    .limit(1);

  if (!app) {
    throw new DomainError("NOT_FOUND", "Application not found.", 404);
  }

  const [garageRow, customerRow, vehicleRow, lineRows, photoRows, recRows, handoverRow] =
    await Promise.all([
      db.select().from(garages).where(eq(garages.id, job.garageId)).limit(1),
      db
        .select({ name: user.name, phoneNumber: user.phoneNumber, email: user.email })
        .from(customers)
        .innerJoin(user, eq(customers.userId, user.id))
        .where(eq(customers.id, app.customerId))
        .limit(1),
      app.vehicleId
        ? db.select().from(vehicles).where(eq(vehicles.id, app.vehicleId)).limit(1)
        : Promise.resolve([]),
      db
        .select({
          id: jobCardLines.id,
          scopeItemId: jobCardLines.scopeItemId,
          technicianName: jobCardLines.technicianName,
          partFitted: jobCardLines.partFitted,
          grade: jobCardLines.grade,
          warrantyToDate: jobCardLines.warrantyToDate,
          warrantyToKm: jobCardLines.warrantyToKm,
          completedAt: jobCardLines.completedAt,
          serviceCode: scopeItems.serviceCode,
          description: scopeItems.description,
          approvedGrade: scopeItems.partGrade,
          approvedBrand: scopeItems.partBrand,
        })
        .from(jobCardLines)
        .innerJoin(scopeItems, eq(jobCardLines.scopeItemId, scopeItems.id))
        .where(eq(jobCardLines.jobCardId, job.id))
        .orderBy(asc(scopeItems.seq)),
      db
        .select()
        .from(jobCardPhotos)
        .where(eq(jobCardPhotos.jobCardId, job.id))
        .orderBy(desc(jobCardPhotos.createdAt)),
      db
        .select()
        .from(recommendations)
        .where(eq(recommendations.jobCardId, job.id))
        .orderBy(desc(recommendations.createdAt)),
      db
        .select()
        .from(handovers)
        .where(eq(handovers.applicationId, app.id))
        .limit(1),
    ]);

  return {
    job,
    application: app,
    garage: garageRow[0] ?? null,
    customer: customerRow[0] ?? null,
    vehicle: vehicleRow[0] ?? null,
    lines: lineRows,
    photos: photoRows,
    recommendations: recRows,
    handover: handoverRow[0] ?? null,
  };
}

export async function updateArrivalAndStartJobService(
  actor: Actor,
  input: {
    jobId: string;
    mileageIn: number;
    fuelLevel: string;
    bodyCondition: string;
    trackerPresent: boolean;
    spareWheel: boolean;
    dashboardWarnings: string;
    notes?: string;
  },
) {
  return withActor(actor, async ({ db }) => {
    const [job] = await db.select().from(jobCards).where(eq(jobCards.id, input.jobId)).limit(1);
    if (!job) throw new DomainError("NOT_FOUND", "Job card not found.", 404);
    if (job.status === "completed") {
      throw new DomainError("VALIDATION_ERROR", "Completed job cards cannot be modified.", 400);
    }

    const bothAttestationsPresent = await checkBothAttestations(db, job.applicationId);
    authorize(actor, "job_card:write", {
      garageId: job.garageId,
      bothAttestationsPresent,
    });

    const arrivalChecks = {
      fuelLevel: input.fuelLevel,
      bodyCondition: input.bodyCondition,
      trackerPresent: input.trackerPresent,
      spareWheel: input.spareWheel,
      dashboardWarnings: input.dashboardWarnings.trim(),
      notes: input.notes?.trim() ?? "",
    };

    const [updated] = await db
      .update(jobCards)
      .set({
        mileageIn: Math.round(input.mileageIn),
        arrivalChecks,
        status: job.status === "opened" ? "in_progress" : job.status,
        openedBy: job.openedBy ?? actor.userId,
        updatedAt: new Date(),
      })
      .where(eq(jobCards.id, job.id))
      .returning();

    await audit({
      db,
      actor,
      action: "job_card.checked_in",
      entityType: "job_card",
      entityId: job.id,
      meta: { mileageIn: updated.mileageIn, status: updated.status },
    });

    return updated;
  });
}

export async function updateJobCardLineService(
  actor: Actor,
  input: {
    lineId: string;
    technicianName: string;
    partFitted: string;
    grade: string;
    warrantyToDate?: string;
    warrantyToKm?: number | null;
    completed: boolean;
  },
) {
  return withActor(actor, async ({ db }) => {
    const [line] = await db
      .select()
      .from(jobCardLines)
      .where(eq(jobCardLines.id, input.lineId))
      .limit(1);
    if (!line) throw new DomainError("NOT_FOUND", "Job card line not found.", 404);

    const [job] = await db
      .select()
      .from(jobCards)
      .where(eq(jobCards.id, line.jobCardId))
      .limit(1);
    if (!job) throw new DomainError("NOT_FOUND", "Job card not found.", 404);
    if (job.status === "completed") {
      throw new DomainError("VALIDATION_ERROR", "Completed job cards cannot be modified.", 400);
    }

    const bothAttestationsPresent = await checkBothAttestations(db, job.applicationId);
    authorize(actor, "job_card:write", {
      garageId: job.garageId,
      bothAttestationsPresent,
    });

    const now = new Date();
    const [updated] = await db
      .update(jobCardLines)
      .set({
        technicianName: input.technicianName.trim() || null,
        partFitted: input.partFitted.trim() || null,
        grade: input.grade.trim() || null,
        warrantyToDate: input.warrantyToDate?.trim() || null,
        warrantyToKm:
          typeof input.warrantyToKm === "number" && input.warrantyToKm > 0
            ? Math.round(input.warrantyToKm)
            : null,
        completedAt: input.completed ? (line.completedAt ?? now) : null,
        updatedAt: now,
      })
      .where(eq(jobCardLines.id, line.id))
      .returning();

    if (job.status === "opened") {
      await db
        .update(jobCards)
        .set({ status: "in_progress", openedBy: job.openedBy ?? actor.userId, updatedAt: now })
        .where(eq(jobCards.id, job.id));
    }

    await audit({
      db,
      actor,
      action: "job_card_line.updated",
      entityType: "job_card_line",
      entityId: line.id,
      meta: { jobCardId: job.id, completed: input.completed },
    });

    return updated;
  });
}

export async function addJobCardPhotoService(
  actor: Actor,
  input: {
    jobId: string;
    kind: PhotoKind;
    fileBuffer: Buffer;
    contentType: string;
    ext: string;
  },
) {
  return withActor(actor, async ({ db }) => {
    const [job] = await db.select().from(jobCards).where(eq(jobCards.id, input.jobId)).limit(1);
    if (!job) throw new DomainError("NOT_FOUND", "Job card not found.", 404);

    const bothAttestationsPresent = await checkBothAttestations(db, job.applicationId);
    authorize(actor, "job_card:write", {
      garageId: job.garageId,
      bothAttestationsPresent,
    });

    const safeExt = input.ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "jpg";
    const storageKey = `job-cards/${job.id}/${input.kind}-${uuidv7()}.${safeExt}`;

    await putPrivateObject({
      key: storageKey,
      body: input.fileBuffer,
      contentType: input.contentType,
    });

    const [photo] = await db
      .insert(jobCardPhotos)
      .values({
        jobCardId: job.id,
        kind: input.kind,
        storageKey,
      })
      .returning();

    await audit({
      db,
      actor,
      action: "job_card_photo.uploaded",
      entityType: "job_card_photo",
      entityId: photo.id,
      meta: { jobCardId: job.id, kind: input.kind },
    });

    return photo;
  });
}

export async function addRecommendationService(
  actor: Actor,
  input: {
    jobId: string;
    finding: string;
    urgency: RecommendationUrgency;
    reminderOn?: string;
  },
) {
  return withActor(actor, async ({ db }) => {
    const [job] = await db.select().from(jobCards).where(eq(jobCards.id, input.jobId)).limit(1);
    if (!job) throw new DomainError("NOT_FOUND", "Job card not found.", 404);

    const bothAttestationsPresent = await checkBothAttestations(db, job.applicationId);
    authorize(actor, "job_card:write", {
      garageId: job.garageId,
      bothAttestationsPresent,
    });

    const [created] = await db
      .insert(recommendations)
      .values({
        applicationId: job.applicationId,
        jobCardId: job.id,
        finding: input.finding.trim(),
        urgency: input.urgency,
        reminderOn: input.reminderOn?.trim() || null,
      })
      .returning();

    return created;
  });
}

export async function deleteRecommendationService(actor: Actor, recommendationId: string) {
  return withActor(actor, async ({ db }) => {
    const [rec] = await db
      .select()
      .from(recommendations)
      .where(eq(recommendations.id, recommendationId))
      .limit(1);
    if (!rec) throw new DomainError("NOT_FOUND", "Recommendation not found.", 404);

    const [job] = await db
      .select()
      .from(jobCards)
      .where(eq(jobCards.id, rec.jobCardId))
      .limit(1);
    if (!job) throw new DomainError("NOT_FOUND", "Job card not found.", 404);
    if (job.status === "completed") {
      throw new DomainError("VALIDATION_ERROR", "Completed job cards cannot be modified.", 400);
    }

    const bothAttestationsPresent = await checkBothAttestations(db, job.applicationId);
    authorize(actor, "job_card:write", {
      garageId: job.garageId,
      bothAttestationsPresent,
    });

    await db.delete(recommendations).where(eq(recommendations.id, rec.id));
    return { deleted: true };
  });
}

async function finalizeHandoverAndTransitionToRepaying(params: {
  db: DbOrTx;
  actor: Actor;
  job: typeof jobCards.$inferSelect;
  handover: typeof handovers.$inferSelect;
  signerUserId: string;
  customerUserId: string;
  typedName: string;
}) {
  const { db, actor, job, handover, signerUserId, customerUserId, typedName } = params;
  const now = new Date();

  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, job.applicationId))
    .limit(1);
  if (!app) throw new DomainError("NOT_FOUND", "Application not found.", 404);

  const snapshot = {
    jobNo: job.jobNo,
    applicationReference: app.reference,
    mileageIn: job.mileageIn,
    mileageOut: job.mileageOut,
    roadTestKm: handover.roadTestKm,
    roadTestResult: handover.roadTestResult,
    walkthroughDone: handover.walkthroughDone,
    partsReturned: handover.partsReturned,
    nextServiceKm: handover.nextServiceKm,
    nextServiceDate: handover.nextServiceDate,
    signedBy: typedName,
    handedOverAt: now.toISOString(),
  };
  const hash = sha256Hex(JSON.stringify(snapshot));

  const [certDoc] = await db
    .insert(documents)
    .values({
      applicationId: app.id,
      type: "handover_certificate",
      docNumber: `HND-${app.reference ?? app.id.slice(0, 8)}-${Date.now().toString().slice(-4)}`,
      version: 1,
      status: "issued",
      dataSnapshot: snapshot,
      pdfSha256: hash,
      issuedAt: now,
      immutable: true,
    })
    .returning();

  const [sig] = await db
    .insert(signatures)
    .values({
      userId: signerUserId,
      documentId: certDoc.id,
      method: "otp_confirm",
      otpVerifiedAt: now,
      typedName,
      ip: actor.ip ?? null,
      userAgent: actor.userAgent ?? null,
      documentSha256: hash,
      signedAt: now,
    })
    .returning();

  await db
    .update(handovers)
    .set({
      customerSignatureId: sig.id,
      handedOverAt: now,
      updatedAt: now,
    })
    .where(eq(handovers.id, handover.id));

  await db
    .update(jobCards)
    .set({
      status: "completed",
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(jobCards.id, job.id));

  if (app.status === "REPAIR_IN_PROGRESS") {
    await transition({
      db,
      applicationId: app.id,
      to: "REPAYING",
      actor,
      customerUserId,
      meta: { jobCardId: job.id, handoverId: handover.id, certificateDocId: certDoc.id },
    });
  }

  return { certificateDocNumber: certDoc.docNumber };
}

export async function recordGarageHandoverService(
  actor: Actor,
  input: {
    jobId: string;
    mileageOut: number;
    roadTestKm?: number | null;
    roadTestResult: string;
    walkthroughDone: boolean;
    partsReturned: boolean;
    nextServiceKm?: number | null;
    nextServiceDate?: string;
    completeOnSite: boolean;
    customerTypedName?: string;
  },
) {
  return withActor(actor, async ({ db }) => {
    const [job] = await db.select().from(jobCards).where(eq(jobCards.id, input.jobId)).limit(1);
    if (!job) throw new DomainError("NOT_FOUND", "Job card not found.", 404);
    if (job.status === "completed") {
      throw new DomainError("VALIDATION_ERROR", "Handover has already been completed.", 400);
    }

    const bothAttestationsPresent = await checkBothAttestations(db, job.applicationId);
    authorize(actor, "handover:record", {
      garageId: job.garageId,
      bothAttestationsPresent,
    });

    const lines = await db
      .select({ completedAt: jobCardLines.completedAt })
      .from(jobCardLines)
      .where(eq(jobCardLines.jobCardId, job.id));

    const check = validateHandoverReadiness({
      totalLines: lines.length,
      completedLines: lines.filter((l) => Boolean(l.completedAt)).length,
      mileageIn: job.mileageIn,
      mileageOut: input.mileageOut,
    });
    if (!check.ok) {
      throw new DomainError("VALIDATION_ERROR", check.message, 400);
    }

    if (input.completeOnSite && (!input.customerTypedName || input.customerTypedName.trim().length < 2)) {
      throw new DomainError(
        "VALIDATION_ERROR",
        "Enter the customer's full name to complete handover on-site.",
        400,
      );
    }

    const now = new Date();
    const [updatedJob] = await db
      .update(jobCards)
      .set({
        mileageOut: Math.round(input.mileageOut),
        updatedAt: now,
      })
      .where(eq(jobCards.id, job.id))
      .returning();

    const [existingHo] = await db
      .select()
      .from(handovers)
      .where(eq(handovers.applicationId, job.applicationId))
      .limit(1);

    const hoValues = {
      roadTestKm:
        typeof input.roadTestKm === "number" && input.roadTestKm >= 0
          ? Math.round(input.roadTestKm)
          : null,
      roadTestResult: input.roadTestResult.trim(),
      walkthroughDone: input.walkthroughDone,
      partsReturned: input.partsReturned,
      nextServiceKm:
        typeof input.nextServiceKm === "number" && input.nextServiceKm > 0
          ? Math.round(input.nextServiceKm)
          : null,
      nextServiceDate: input.nextServiceDate?.trim() || null,
      updatedAt: now,
    };

    const [handover] = existingHo
      ? await db
          .update(handovers)
          .set(hoValues)
          .where(eq(handovers.id, existingHo.id))
          .returning()
      : await db
          .insert(handovers)
          .values({
            applicationId: job.applicationId,
            ...hoValues,
          })
          .returning();

    await audit({
      db,
      actor,
      action: "handover.qa_recorded",
      entityType: "handover",
      entityId: handover.id,
      meta: { jobCardId: job.id, completeOnSite: input.completeOnSite },
    });

    if (input.completeOnSite) {
      const [app] = await db
        .select({ customerId: applications.customerId })
        .from(applications)
        .where(eq(applications.id, job.applicationId))
        .limit(1);
      const [cust] = app
        ? await db
            .select({ userId: customers.userId })
            .from(customers)
            .where(eq(customers.id, app.customerId))
            .limit(1)
        : [];

      const res = await finalizeHandoverAndTransitionToRepaying({
        db,
        actor,
        job: updatedJob,
        handover,
        signerUserId: cust?.userId ?? actor.userId!,
        customerUserId: cust?.userId ?? actor.userId!,
        typedName: input.customerTypedName!.trim(),
      });
      return { completed: true, certificateDocNumber: res.certificateDocNumber };
    }

    return { completed: false, certificateDocNumber: null };
  });
}

export async function getCustomerRepairAndHandoverData(applicationId: string) {
  const db = getDb();
  const [job] = await db
    .select()
    .from(jobCards)
    .where(eq(jobCards.applicationId, applicationId))
    .limit(1);
  if (!job) return null;

  const [lines, recRows, handoverRows, photoRows] = await Promise.all([
    db
      .select({
        id: jobCardLines.id,
        description: scopeItems.description,
        serviceCode: scopeItems.serviceCode,
        partFitted: jobCardLines.partFitted,
        grade: jobCardLines.grade,
        warrantyToDate: jobCardLines.warrantyToDate,
        warrantyToKm: jobCardLines.warrantyToKm,
        completedAt: jobCardLines.completedAt,
      })
      .from(jobCardLines)
      .innerJoin(scopeItems, eq(jobCardLines.scopeItemId, scopeItems.id))
      .where(eq(jobCardLines.jobCardId, job.id))
      .orderBy(asc(scopeItems.seq)),
    db
      .select()
      .from(recommendations)
      .where(eq(recommendations.jobCardId, job.id))
      .orderBy(desc(recommendations.createdAt)),
    db.select().from(handovers).where(eq(handovers.applicationId, applicationId)).limit(1),
    db
      .select()
      .from(jobCardPhotos)
      .where(eq(jobCardPhotos.jobCardId, job.id))
      .orderBy(desc(jobCardPhotos.createdAt)),
  ]);

  return {
    job,
    lines,
    recommendations: recRows,
    handover: handoverRows[0] ?? null,
    photos: photoRows,
  };
}

export async function customerConfirmHandoverService(
  actor: Actor,
  input: {
    applicationId: string;
    typedName: string;
  },
) {
  if (!actor.userId || !actor.customerId) {
    throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);
  }
  if (!input.typedName || input.typedName.trim().length < 2) {
    throw new DomainError("VALIDATION_ERROR", "Enter your full name to confirm handover.", 400);
  }

  return withActor(actor, async ({ db }) => {
    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .limit(1);
    if (!app) throw new DomainError("NOT_FOUND", "Application not found.", 404);
    authorize(actor, "handover:confirm", { customerId: app.customerId });

    const [job] = await db
      .select()
      .from(jobCards)
      .where(eq(jobCards.applicationId, app.id))
      .limit(1);
    if (!job) throw new DomainError("NOT_FOUND", "Job card not found.", 404);
    if (job.status === "completed") {
      throw new DomainError("VALIDATION_ERROR", "Handover is already confirmed.", 400);
    }

    const [handover] = await db
      .select()
      .from(handovers)
      .where(eq(handovers.applicationId, app.id))
      .limit(1);
    if (!handover) {
      throw new DomainError(
        "VALIDATION_ERROR",
        "The garage has not yet completed QA sign-off for handover.",
        400,
      );
    }

    return finalizeHandoverAndTransitionToRepaying({
      db,
      actor,
      job,
      handover,
      signerUserId: actor.userId!,
      customerUserId: actor.userId!,
      typedName: input.typedName.trim(),
    });
  });
}
