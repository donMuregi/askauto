import { desc, eq, inArray, sql } from "drizzle-orm";
import { DEFAULT_SCOPE_VARIANCE_PCT, DEFAULT_VAT_RATE_PCT } from "@/lib/constants";
import { sha256Hex } from "@/lib/crypto";
import { DomainError } from "@/lib/errors";
import { getDb, type DbOrTx } from "@/server/db/client";
import { withActor, type Actor } from "@/server/db/rls";
import {
  applications,
  bookings,
  catalogueParts,
  customers,
  documents,
  findings,
  garages,
  inspectionPhotos,
  inspections,
  scopeItems,
  scopes,
  serviceCatalogue,
  signatures,
  user,
  vehicles,
} from "@/server/db/schema";
import { audit } from "@/server/domain/audit";
import { transition } from "@/server/domain/applications/transition";
import { authorize } from "@/server/policies/can";

export type AssessmentState =
  | "new"
  | "draft"
  | "returned"
  | "submitted"
  | "scope_sent"
  | "approved";

export interface AssessorDashboardItem {
  applicationId: string;
  reference: string | null;
  applicationStatus: string;
  assessmentState: AssessmentState;
  regNo: string;
  makeModel: string;
  vehicleYear: number | null;
  customerName: string;
  faultDescription: string | null;
  slotStart: Date;
  garageLabel: string;
  assessorId: string | null;
  inspectionId: string | null;
  inspectionStatus: string | null;
  inspectionUpdatedAt: Date | null;
  findingsCount: number;
  scopeStatus: string | null;
  scopeTotalKes: number | null;
  returnNotes: string | null;
}

export function deriveAssessmentState(params: {
  applicationStatus: string;
  inspectionStatus: string | null;
  returnNotes: string | null;
  scopeStatus: string | null;
}): AssessmentState {
  if (params.applicationStatus === "BOOKED") {
    if (params.returnNotes) return "returned";
    if (params.inspectionStatus === "draft") return "draft";
    return "new";
  }
  if (
    params.applicationStatus === "REPORT_SUBMITTED" ||
    params.applicationStatus === "REPORT_READY"
  ) {
    return "submitted";
  }
  if (params.applicationStatus === "SCOPE_SENT") {
    return "scope_sent";
  }
  return "approved";
}

export async function getAssessorDashboardData(actor: Actor, search?: string) {
  authorize(actor, "inspection:read");
  const db = getDb();

  const rows = await db
    .select({
      applicationId: applications.id,
      reference: applications.reference,
      applicationStatus: applications.status,
      faultDescription: applications.faultDescription,
      regNo: vehicles.regNo,
      makeModel: vehicles.makeModel,
      vehicleYear: vehicles.year,
      customerName: user.name,
      slotStart: bookings.slotStart,
      bookingAssessorId: bookings.assessorId,
      garageName: garages.name,
      garageBranch: garages.branchName,
    })
    .from(bookings)
    .innerJoin(applications, eq(bookings.applicationId, applications.id))
    .innerJoin(customers, eq(applications.customerId, customers.id))
    .innerJoin(user, eq(customers.userId, user.id))
    .innerJoin(garages, eq(bookings.garageId, garages.id))
    .leftJoin(vehicles, eq(applications.vehicleId, vehicles.id))
    .orderBy(desc(bookings.slotStart))
    .limit(200);

  const appIds = rows.map((r) => r.applicationId);

  const [allInspections, allScopes] =
    appIds.length > 0
      ? await Promise.all([
          db
            .select()
            .from(inspections)
            .where(inArray(inspections.applicationId, appIds))
            .orderBy(desc(inspections.version)),
          db
            .select()
            .from(scopes)
            .where(inArray(scopes.applicationId, appIds))
            .orderBy(desc(scopes.version)),
        ])
      : [[], []];

  const latestInspectionByApp = new Map<string, (typeof allInspections)[number]>();
  for (const insp of allInspections) {
    if (!latestInspectionByApp.has(insp.applicationId)) {
      latestInspectionByApp.set(insp.applicationId, insp);
    }
  }

  const latestScopeByApp = new Map<string, (typeof allScopes)[number]>();
  for (const sc of allScopes) {
    if (!latestScopeByApp.has(sc.applicationId)) {
      latestScopeByApp.set(sc.applicationId, sc);
    }
  }

  const inspIds = [...latestInspectionByApp.values()].map((i) => i.id);
  const findingCounts =
    inspIds.length > 0
      ? await db
          .select({
            inspectionId: findings.inspectionId,
            count: sql<number>`count(*)::int`,
          })
          .from(findings)
          .where(inArray(findings.inspectionId, inspIds))
          .groupBy(findings.inspectionId)
      : [];
  const findingCountMap = new Map(findingCounts.map((f) => [f.inspectionId, f.count]));

  const query = search?.trim().toLowerCase() ?? "";

  const allItems: AssessorDashboardItem[] = rows
    .filter((r) => r.applicationStatus !== "DRAFT" && r.applicationStatus !== "CANCELLED")
    .map((r) => {
      const insp = latestInspectionByApp.get(r.applicationId) ?? null;
      const scope = latestScopeByApp.get(r.applicationId) ?? null;
      const assessmentState = deriveAssessmentState({
        applicationStatus: r.applicationStatus,
        inspectionStatus: insp?.status ?? null,
        returnNotes: insp?.returnNotes ?? null,
        scopeStatus: scope?.status ?? null,
      });

      return {
        applicationId: r.applicationId,
        reference: r.reference,
        applicationStatus: r.applicationStatus,
        assessmentState,
        regNo: r.regNo ?? "Pending",
        makeModel: r.makeModel ?? "Pending",
        vehicleYear: r.vehicleYear ?? null,
        customerName: r.customerName,
        faultDescription: r.faultDescription,
        slotStart: r.slotStart,
        garageLabel: r.garageBranch ?? r.garageName,
        assessorId: insp?.assessorId ?? r.bookingAssessorId ?? null,
        inspectionId: insp?.id ?? null,
        inspectionStatus: insp?.status ?? null,
        inspectionUpdatedAt: insp?.updatedAt ?? null,
        findingsCount: insp ? (findingCountMap.get(insp.id) ?? 0) : 0,
        scopeStatus: scope?.status ?? null,
        scopeTotalKes: scope ? scope.totalKes : null,
        returnNotes: insp?.returnNotes ?? null,
      };
    });

  const filtered = query
    ? allItems.filter(
        (item) =>
          item.regNo.toLowerCase().includes(query) ||
          item.makeModel.toLowerCase().includes(query) ||
          item.customerName.toLowerCase().includes(query) ||
          (item.reference?.toLowerCase().includes(query) ?? false),
      )
    : allItems;

  const counts = {
    newCount: allItems.filter((i) => i.assessmentState === "new").length,
    inProgressCount: allItems.filter(
      (i) => i.assessmentState === "draft" || i.assessmentState === "returned",
    ).length,
    awaitingScopeCount: allItems.filter((i) => i.assessmentState === "submitted").length,
    priorAssessedCount: allItems.filter(
      (i) =>
        i.assessmentState === "submitted" ||
        i.assessmentState === "scope_sent" ||
        i.assessmentState === "approved",
    ).length,
  };

  return { items: filtered, counts };
}

export async function getAssessorInspectionWorkspace(actor: Actor, applicationId: string) {
  authorize(actor, "inspection:read");
  const db = getDb();

  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (!app) {
    throw new DomainError("NOT_FOUND", "Application not found.", 404);
  }

  const [vehicleRows, customerRows, bookingRows, inspRows, scopeRows, catalogueRows, partRows] =
    await Promise.all([
      app.vehicleId
        ? db.select().from(vehicles).where(eq(vehicles.id, app.vehicleId)).limit(1)
        : Promise.resolve([]),
      db
        .select({
          customerId: customers.id,
          userId: user.id,
          name: user.name,
          phoneNumber: user.phoneNumber,
          email: user.email,
        })
        .from(customers)
        .innerJoin(user, eq(customers.userId, user.id))
        .where(eq(customers.id, app.customerId))
        .limit(1),
      db
        .select({
          booking: bookings,
          garageName: garages.name,
          garageBranch: garages.branchName,
          garageAddress: garages.address,
        })
        .from(bookings)
        .innerJoin(garages, eq(bookings.garageId, garages.id))
        .where(eq(bookings.applicationId, app.id))
        .orderBy(desc(bookings.createdAt))
        .limit(1),
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
      db.select().from(serviceCatalogue).where(eq(serviceCatalogue.active, true)),
      db.select().from(catalogueParts),
    ]);

  const latestInspection = inspRows[0] ?? null;
  const latestScope = scopeRows[0] ?? null;

  const [inspectionFindings, photos, items] = await Promise.all([
    latestInspection
      ? db
          .select()
          .from(findings)
          .where(eq(findings.inspectionId, latestInspection.id))
          .orderBy(findings.seq)
      : Promise.resolve([]),
    latestInspection
      ? db
          .select()
          .from(inspectionPhotos)
          .where(eq(inspectionPhotos.inspectionId, latestInspection.id))
      : Promise.resolve([]),
    latestScope
      ? db
          .select()
          .from(scopeItems)
          .where(eq(scopeItems.scopeId, latestScope.id))
          .orderBy(scopeItems.seq)
      : Promise.resolve([]),
  ]);

  const catalogue = catalogueRows.map((svc) => ({
    ...svc,
    parts: partRows.filter((p) => p.serviceId === svc.id),
  }));

  return {
    application: app,
    vehicle: vehicleRows[0] ?? null,
    customer: customerRows[0] ?? null,
    booking: bookingRows[0] ?? null,
    inspection: latestInspection,
    findings: inspectionFindings,
    photos,
    scope: latestScope,
    scopeItems: items,
    catalogue,
  };
}

export interface FindingInput {
  componentCode: string;
  componentLabel: string;
  findingText: string;
  recommendedAction: string;
  urgency:
    | "do_not_delay"
    | "within_1_month"
    | "with_the_above"
    | "three_to_four_months"
    | "monitor"
    | "no_action";
}

export interface PhotoInput {
  kind: string;
  storageKey: string;
  capturedAtIso: string;
  sha256: string;
  lat?: string | null;
  lng?: string | null;
  accuracyM?: number | null;
}

export interface SaveInspectionInput {
  applicationId: string;
  mileageKm: number;
  durationMinutes: number;
  diagnosticsRun: string[];
  faultCodes: string[];
  fuelTransmissionNote?: string;
  findings: FindingInput[];
  photos?: PhotoInput[];
  submitReport?: boolean;
}

async function upsertDocumentSnapshot(
  db: DbOrTx,
  params: {
    applicationId: string;
    type: "diagnostic_report" | "approved_repair_scope";
    reference: string;
    snapshot: Record<string, unknown>;
    issueNow?: boolean;
  },
) {
  const prefix = params.type === "diagnostic_report" ? "DR" : "ARS";
  const existing = await db
    .select()
    .from(documents)
    .where(eq(documents.applicationId, params.applicationId))
    .orderBy(desc(documents.version));

  const sameType = existing.filter((d) => d.type === params.type);
  const nextVersion = sameType.length === 0 ? 1 : sameType[0].version + 1;
  const docNumber =
    nextVersion === 1
      ? `${prefix}-${params.reference}`
      : `${prefix}-${params.reference}-v${nextVersion}`;

  const [created] = await db
    .insert(documents)
    .values({
      applicationId: params.applicationId,
      type: params.type,
      docNumber,
      version: nextVersion,
      status: params.issueNow ? "issued" : "draft",
      dataSnapshot: params.snapshot,
      pdfSha256: sha256Hex(JSON.stringify(params.snapshot)),
      issuedAt: params.issueNow ? new Date() : null,
      immutable: Boolean(params.issueNow),
    })
    .returning();

  return created;
}

export async function saveInspectionService(actor: Actor, input: SaveInspectionInput) {
  authorize(actor, "inspection:write");
  if (!actor.userId) {
    throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);
  }

  return withActor(actor, async ({ db }) => {
    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .limit(1);
    if (!app) {
      throw new DomainError("NOT_FOUND", "Application not found.", 404);
    }

    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.applicationId, app.id))
      .orderBy(desc(bookings.createdAt))
      .limit(1);
    if (!booking) {
      throw new DomainError("VALIDATION_ERROR", "No booking exists for this application.", 400);
    }

    const [cust] = await db
      .select({ userId: customers.userId })
      .from(customers)
      .where(eq(customers.id, app.customerId))
      .limit(1);

    const existingInspections = await db
      .select()
      .from(inspections)
      .where(eq(inspections.applicationId, app.id))
      .orderBy(desc(inspections.version));

    const latest = existingInspections[0];
    let inspectionId: string;
    const now = new Date();

    if (latest && latest.status === "draft") {
      await db
        .update(inspections)
        .set({
          assessorId: actor.userId!,
          mileageKm: input.mileageKm,
          durationMinutes: input.durationMinutes,
          diagnosticsRun: input.diagnosticsRun,
          faultCodes: input.faultCodes,
          fuelTransmissionNote: input.fuelTransmissionNote?.trim() || null,
          status: input.submitReport ? "submitted" : "draft",
          submittedAt: input.submitReport ? now : null,
          updatedAt: now,
        })
        .where(eq(inspections.id, latest.id));
      inspectionId = latest.id;

      await db.delete(findings).where(eq(findings.inspectionId, inspectionId));
    } else {
      const nextVersion = latest ? latest.version + 1 : 1;
      const [created] = await db
        .insert(inspections)
        .values({
          applicationId: app.id,
          bookingId: booking.id,
          assessorId: actor.userId!,
          version: nextVersion,
          status: input.submitReport ? "submitted" : "draft",
          mileageKm: input.mileageKm,
          durationMinutes: input.durationMinutes,
          diagnosticsRun: input.diagnosticsRun,
          faultCodes: input.faultCodes,
          fuelTransmissionNote: input.fuelTransmissionNote?.trim() || null,
          submittedAt: input.submitReport ? now : null,
        })
        .returning();
      inspectionId = created.id;
    }

    if (!booking.assessorId) {
      await db
        .update(bookings)
        .set({ assessorId: actor.userId!, updatedAt: now })
        .where(eq(bookings.id, booking.id));
    }

    if (input.findings.length > 0) {
      await db.insert(findings).values(
        input.findings.map((f, index) => ({
          inspectionId,
          seq: index + 1,
          componentCode: f.componentCode,
          componentLabel: f.componentLabel,
          findingText: f.findingText.trim(),
          recommendedAction: f.recommendedAction.trim(),
          urgency: f.urgency,
        })),
      );
    }

    if (input.photos && input.photos.length > 0) {
      await db.insert(inspectionPhotos).values(
        input.photos.map((p) => ({
          inspectionId,
          kind: p.kind,
          storageKey: p.storageKey,
          capturedAt: new Date(p.capturedAtIso),
          sha256: p.sha256,
          lat: p.lat ?? null,
          lng: p.lng ?? null,
          accuracyM: p.accuracyM ?? null,
        })),
      );
    }

    if (input.submitReport) {
      if (input.findings.length === 0) {
        throw new DomainError(
          "VALIDATION_ERROR",
          "Add at least one diagnostic finding before submitting.",
          400,
        );
      }
      if (app.status === "BOOKED") {
        await transition({
          db,
          applicationId: app.id,
          to: "REPORT_SUBMITTED",
          actor,
          customerUserId: cust?.userId ?? null,
          meta: { inspectionId },
        });
      }
      await db
        .update(bookings)
        .set({ status: "completed", updatedAt: now })
        .where(eq(bookings.id, booking.id));

      if (app.reference) {
        await upsertDocumentSnapshot(db, {
          applicationId: app.id,
          type: "diagnostic_report",
          reference: app.reference,
          snapshot: {
            inspectionId,
            mileageKm: input.mileageKm,
            durationMinutes: input.durationMinutes,
            diagnosticsRun: input.diagnosticsRun,
            faultCodes: input.faultCodes,
            findings: input.findings,
          },
          issueNow: false,
        });
      }
    } else {
      await audit({
        db,
        actor,
        action: "inspection.draft_saved",
        entityType: "inspection",
        entityId: inspectionId,
        meta: { applicationId: app.id, findingsCount: input.findings.length },
      });
    }

    return { inspectionId };
  });
}

export interface ScopeItemInput {
  serviceId: string;
  description: string;
  partGrade: "OEM" | "aftermarket" | "none";
  partBrand?: string;
  partsKes: number;
  labourKes: number;
}

export function calculateScopeTotals(
  items: Array<{ partsKes: number; labourKes: number; decision?: string }>,
  vatRatePct = DEFAULT_VAT_RATE_PCT,
  feeCreditKes = 0,
) {
  const activeItems = items.filter((i) => i.decision !== "deferred");
  const subtotalKes = activeItems.reduce(
    (sum, item) => sum + Math.max(0, Math.round(item.partsKes)) + Math.max(0, Math.round(item.labourKes)),
    0,
  );
  const vatKes = Math.round((subtotalKes * vatRatePct) / 100);
  // R2: KES 1,500 inspection fee is never financed; feeCreditKes defaults to 0 (O4)
  const totalKes = Math.max(0, subtotalKes + vatKes - Math.max(0, Math.round(feeCreditKes)));
  return { subtotalKes, vatKes, totalKes };
}

export async function saveRepairScopeService(
  actor: Actor,
  input: {
    applicationId: string;
    items: ScopeItemInput[];
    sendToCustomer: boolean;
  },
) {
  authorize(actor, "scope:build");
  if (input.sendToCustomer) {
    authorize(actor, "scope:send");
  }
  if (!actor.userId) {
    throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);
  }
  if (input.items.length === 0) {
    throw new DomainError(
      "VALIDATION_ERROR",
      "Add at least one repair line item to the scope.",
      400,
    );
  }

  return withActor(actor, async ({ db }) => {
    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .limit(1);
    if (!app) {
      throw new DomainError("NOT_FOUND", "Application not found.", 404);
    }

    const [cust] = await db
      .select({ userId: customers.userId })
      .from(customers)
      .where(eq(customers.id, app.customerId))
      .limit(1);

    const svcIds = [...new Set(input.items.map((i) => i.serviceId))];
    const [svcs, parts] = await Promise.all([
      db.select().from(serviceCatalogue).where(inArray(serviceCatalogue.id, svcIds)),
      db.select().from(catalogueParts).where(inArray(catalogueParts.serviceId, svcIds)),
    ]);
    const svcMap = new Map(svcs.map((s) => [s.id, s]));

    const computedLines = input.items.map((item, idx) => {
      const svc = svcMap.get(item.serviceId);
      if (!svc) {
        throw new DomainError("VALIDATION_ERROR", "Selected catalogue service was not found.", 400);
      }
      const partsKes = Math.max(0, Math.round(item.partsKes));
      const labourKes = Math.max(0, Math.round(item.labourKes));
      const lineTotalKes = partsKes + labourKes;

      const tolerance = 1 + DEFAULT_SCOPE_VARIANCE_PCT / 100;
      const matchingPart = parts.find(
        (p) => p.serviceId === svc.id && p.grade === item.partGrade,
      );
      const labourVariance =
        labourKes < svc.labourMinKes || labourKes > Math.round(svc.labourMaxKes * tolerance);
      const partVariance = matchingPart
        ? partsKes < matchingPart.priceMinKes ||
          partsKes > Math.round(matchingPart.priceMaxKes * tolerance)
        : false;

      return {
        seq: idx + 1,
        serviceId: svc.id,
        serviceCode: svc.code,
        description: item.description.trim() || svc.descriptionTemplate,
        partGrade: item.partGrade,
        partBrand: item.partBrand?.trim() || matchingPart?.brand || null,
        partsKes,
        labourKes,
        lineTotalKes,
        varianceFlag: labourVariance || partVariance,
        decision: "approved",
      };
    });

    const totals = calculateScopeTotals(computedLines, DEFAULT_VAT_RATE_PCT, 0);
    const existingScopes = await db
      .select()
      .from(scopes)
      .where(eq(scopes.applicationId, app.id))
      .orderBy(desc(scopes.version));

    const latestScope = existingScopes[0];
    const now = new Date();
    let scopeId: string;

    if (latestScope && latestScope.status === "draft") {
      await db
        .update(scopes)
        .set({
          subtotalKes: totals.subtotalKes,
          vatKes: totals.vatKes,
          totalKes: totals.totalKes,
          status: input.sendToCustomer ? "sent" : "draft",
          sentAt: input.sendToCustomer ? now : null,
          updatedAt: now,
        })
        .where(eq(scopes.id, latestScope.id));
      scopeId = latestScope.id;
      await db.delete(scopeItems).where(eq(scopeItems.scopeId, scopeId));
    } else {
      if (latestScope && latestScope.status === "sent") {
        await db
          .update(scopes)
          .set({ status: "superseded", updatedAt: now })
          .where(eq(scopes.id, latestScope.id));
      }
      const nextVersion = latestScope ? latestScope.version + 1 : 1;
      const [createdScope] = await db
        .insert(scopes)
        .values({
          applicationId: app.id,
          version: nextVersion,
          status: input.sendToCustomer ? "sent" : "draft",
          subtotalKes: totals.subtotalKes,
          vatKes: totals.vatKes,
          totalKes: totals.totalKes,
          vatRatePct: DEFAULT_VAT_RATE_PCT,
          feeCreditKes: 0,
          builtBy: actor.userId!,
          sentAt: input.sendToCustomer ? now : null,
        })
        .returning();
      scopeId = createdScope.id;
    }

    await db.insert(scopeItems).values(
      computedLines.map((line) => ({
        scopeId,
        ...line,
      })),
    );

    if (input.sendToCustomer) {
      // Ensure inspection exists and is released before sending scope to customer
      const [latestInsp] = await db
        .select()
        .from(inspections)
        .where(eq(inspections.applicationId, app.id))
        .orderBy(desc(inspections.version))
        .limit(1);

      if (!latestInsp) {
        throw new DomainError(
          "VALIDATION_ERROR",
          "Save and submit the diagnostic inspection report before sending a repair scope.",
          400,
        );
      }

      if (latestInsp.status !== "released") {
        await db
          .update(inspections)
          .set({
            status: "released",
            submittedAt: latestInsp.submittedAt ?? now,
            releasedAt: now,
            releasedBy: actor.userId!,
            updatedAt: now,
          })
          .where(eq(inspections.id, latestInsp.id));
      }

      let currentStatus = app.status;
      if (currentStatus === "BOOKED") {
        const afterSubmit = await transition({
          db,
          applicationId: app.id,
          to: "REPORT_SUBMITTED",
          actor,
          customerUserId: cust?.userId ?? null,
          meta: { inspectionId: latestInsp.id },
        });
        currentStatus = afterSubmit.status;
      }

      if (currentStatus === "REPORT_SUBMITTED") {
        const afterReady = await transition({
          db,
          applicationId: app.id,
          to: "REPORT_READY",
          actor,
          customerUserId: cust?.userId ?? null,
          meta: { inspectionId: latestInsp.id },
        });
        currentStatus = afterReady.status;
      }

      if (currentStatus === "REPORT_READY" || currentStatus === "SCOPE_SENT") {
        await transition({
          db,
          applicationId: app.id,
          to: "SCOPE_SENT",
          actor,
          customerUserId: cust?.userId ?? null,
          meta: { scopeId, totalKes: totals.totalKes },
        });
      }

      if (app.reference) {
        await upsertDocumentSnapshot(db, {
          applicationId: app.id,
          type: "approved_repair_scope",
          reference: app.reference,
          snapshot: {
            scopeId,
            totals,
            items: computedLines,
          },
          issueNow: false,
        });
      }
    } else {
      await audit({
        db,
        actor,
        action: "scope.draft_saved",
        entityType: "scope",
        entityId: scopeId,
        meta: { applicationId: app.id, totalKes: totals.totalKes },
      });
    }

    return { scopeId, totals };
  });
}

export async function getCustomerScopeForApproval(applicationId: string) {
  const db = getDb();
  const [latestInspection] = await db
    .select()
    .from(inspections)
    .where(eq(inspections.applicationId, applicationId))
    .orderBy(desc(inspections.version))
    .limit(1);

  const inspectionFindings =
    latestInspection && latestInspection.status === "released"
      ? await db
          .select()
          .from(findings)
          .where(eq(findings.inspectionId, latestInspection.id))
          .orderBy(findings.seq)
      : [];

  const [latestScope] = await db
    .select()
    .from(scopes)
    .where(eq(scopes.applicationId, applicationId))
    .orderBy(desc(scopes.version))
    .limit(1);

  const items =
    latestScope && (latestScope.status === "sent" || latestScope.status === "signed")
      ? await db
          .select()
          .from(scopeItems)
          .where(eq(scopeItems.scopeId, latestScope.id))
          .orderBy(scopeItems.seq)
      : [];

  return {
    releasedInspection: latestInspection?.status === "released" ? latestInspection : null,
    findings: inspectionFindings,
    scope: latestScope && (latestScope.status === "sent" || latestScope.status === "signed") ? latestScope : null,
    scopeItems: items,
  };
}

export async function customerApproveScopeService(
  actor: Actor,
  input: {
    applicationId: string;
    scopeId: string;
    approvedItemIds: string[];
    typedName: string;
  },
) {
  if (!actor.userId || !actor.customerId) {
    throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);
  }
  if (input.approvedItemIds.length === 0) {
    throw new DomainError(
      "VALIDATION_ERROR",
      "Approve at least one repair item to sign the scope.",
      400,
    );
  }
  if (input.typedName.trim().length < 2) {
    throw new DomainError("VALIDATION_ERROR", "Enter your full name to sign.", 400);
  }

  return withActor(actor, async ({ db }) => {
    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, input.applicationId))
      .limit(1);
    if (!app) {
      throw new DomainError("NOT_FOUND", "Application not found.", 404);
    }
    authorize(actor, "scope:sign", { customerId: app.customerId });

    const [scope] = await db
      .select()
      .from(scopes)
      .where(eq(scopes.id, input.scopeId))
      .limit(1);
    if (!scope || scope.applicationId !== app.id || scope.status !== "sent") {
      throw new DomainError("VALIDATION_ERROR", "No active repair scope is waiting for approval.", 400);
    }

    const items = await db
      .select()
      .from(scopeItems)
      .where(eq(scopeItems.scopeId, scope.id))
      .orderBy(scopeItems.seq);

    const approvedSet = new Set(input.approvedItemIds);
    const approvedCount = items.filter((item) => approvedSet.has(item.id)).length;
    if (approvedCount === 0) {
      throw new DomainError("VALIDATION_ERROR", "Approve at least one repair item.", 400);
    }

    const now = new Date();
    for (const item of items) {
      const decision = approvedSet.has(item.id) ? "approved" : "deferred";
      await db
        .update(scopeItems)
        .set({
          decision,
          deferredReason: decision === "deferred" ? "Deferred by customer" : null,
          updatedAt: now,
        })
        .where(eq(scopeItems.id, item.id));
    }

    const updatedTotals = calculateScopeTotals(
      items.map((item) => ({
        partsKes: item.partsKes,
        labourKes: item.labourKes,
        decision: approvedSet.has(item.id) ? "approved" : "deferred",
      })),
      scope.vatRatePct,
      scope.feeCreditKes,
    );

    const snapshot = {
      scopeId: scope.id,
      version: scope.version,
      totals: updatedTotals,
      approvedItemIds: input.approvedItemIds,
      signedBy: input.typedName.trim(),
    };
    const docHash = sha256Hex(JSON.stringify(snapshot));

    const issuedDoc = await upsertDocumentSnapshot(db, {
      applicationId: app.id,
      type: "approved_repair_scope",
      reference: app.reference ?? app.id.slice(0, 8),
      snapshot,
      issueNow: true,
    });

    const [sig] = await db
      .insert(signatures)
      .values({
        userId: actor.userId!,
        documentId: issuedDoc.id,
        method: "otp_confirm",
        otpVerifiedAt: now,
        typedName: input.typedName.trim(),
        ip: actor.ip ?? null,
        userAgent: actor.userAgent ?? null,
        documentSha256: docHash,
        signedAt: now,
      })
      .returning();

    await db
      .update(scopes)
      .set({
        subtotalKes: updatedTotals.subtotalKes,
        vatKes: updatedTotals.vatKes,
        totalKes: updatedTotals.totalKes,
        status: "signed",
        signedAt: now,
        signatureId: sig.id,
        updatedAt: now,
      })
      .where(eq(scopes.id, scope.id));

    await transition({
      db,
      applicationId: app.id,
      to: "REPAIR_APPROVED",
      actor,
      customerUserId: actor.userId,
      meta: { scopeId: scope.id, signatureId: sig.id, totalKes: updatedTotals.totalKes },
    });

    return { scopeId: scope.id, totalKes: updatedTotals.totalKes };
  });
}
