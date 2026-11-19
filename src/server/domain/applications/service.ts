import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { CONSENT_NOTICE_VERSION, DEFAULT_INSPECTION_FEE_KES } from "@/lib/constants";
import { encryptField, hmacHash, sha256Hex } from "@/lib/crypto";
import { DomainError } from "@/lib/errors";
import { NAIROBI_TIMEZONE } from "@/lib/format";
import { normalizeKenyanPhone } from "@/lib/phone";
import { getDb } from "@/server/db/client";
import { SYSTEM_ACTOR, withActor, type Actor } from "@/server/db/rls";
import {
  applications,
  bookings,
  consents,
  customers,
  documents,
  employerEligibleEmployees,
  employers,
  employerSchemes,
  feePayments,
  garages,
  lenders,
  paymentAttestations,
  products,
  settings,
  statusHistory,
  vehicles,
} from "@/server/db/schema";
import { audit } from "@/server/domain/audit";
import { enqueueNotification } from "@/server/domain/notifications/outbox";
import { friendlyMpesaResultMessage, getMpesaProvider } from "@/server/integrations/mpesa";
import { authorize } from "@/server/policies/can";
import {
  DEFAULT_DAILY_ESTIMATE_CONFIG,
  estimateDailyRepayment,
  type DailyEstimateConfig,
} from "./estimate";
import { transition } from "./transition";

export const CONSENT_NOTICE_TEXT =
  "I consent to Ask AutoParts collecting my identity, vehicle, diagnostic inspection, and supporting financial records and sharing my completed application package with the assigned financing partner. Your financing partner pays Ask AutoParts directly.";

export async function getInspectionFeeSetting(): Promise<number> {
  const [row] = await getDb()
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "inspection_fee_kes"))
    .limit(1);
  const parsed = Number(row?.value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : DEFAULT_INSPECTION_FEE_KES;
}

export async function getDailyEstimateConfigSetting(): Promise<DailyEstimateConfig> {
  const [row] = await getDb()
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, "daily_estimate_config"))
    .limit(1);
  if (row?.value && typeof row.value === "object") {
    const val = row.value as Partial<DailyEstimateConfig>;
    return {
      defaultAssumedRepairKes:
        typeof val.defaultAssumedRepairKes === "number"
          ? val.defaultAssumedRepairKes
          : DEFAULT_DAILY_ESTIMATE_CONFIG.defaultAssumedRepairKes,
      assumedTenorDays:
        typeof val.assumedTenorDays === "number"
          ? val.assumedTenorDays
          : DEFAULT_DAILY_ESTIMATE_CONFIG.assumedTenorDays,
      assumedFactor:
        typeof val.assumedFactor === "number"
          ? val.assumedFactor
          : DEFAULT_DAILY_ESTIMATE_CONFIG.assumedFactor,
    };
  }
  return DEFAULT_DAILY_ESTIMATE_CONFIG;
}

export async function listActiveSchemeEmployers() {
  const today = formatInTimeZone(new Date(), NAIROBI_TIMEZONE, "yyyy-MM-dd");
  return getDb()
    .select({
      employerId: employers.id,
      employerName: employers.name,
      schemeId: employerSchemes.id,
      lenderId: employerSchemes.lenderId,
      lenderName: lenders.name,
    })
    .from(employerSchemes)
    .innerJoin(employers, eq(employerSchemes.employerId, employers.id))
    .innerJoin(lenders, eq(employerSchemes.lenderId, lenders.id))
    .where(
      and(
        eq(employers.status, "active"),
        eq(employerSchemes.status, "active"),
        lte(employerSchemes.effectiveFrom, today),
        or(isNull(employerSchemes.effectiveTo), gte(employerSchemes.effectiveTo, today)),
      ),
    );
}

export async function getActiveCustomerApplication(actor: Actor) {
  if (!actor.customerId) return null;
  const [row] = await getDb()
    .select()
    .from(applications)
    .where(and(eq(applications.customerId, actor.customerId), eq(applications.isActive, true)))
    .limit(1);
  return row ?? null;
}

export async function startApplicationService(
  actor: Actor,
  input: {
    product: "RIDE_HAILING" | "SALARIED";
    platform?: "uber" | "bolt" | "little" | "other";
    platformOther?: string;
    employerId?: string;
    employeeNumber?: string;
  },
) {
  authorize(actor, "application:create", { customerId: actor.customerId });
  if (!actor.customerId || !actor.userId) {
    throw new DomainError("FORBIDDEN", "Customer profile is required to apply.", 403);
  }

  return withActor(actor, async ({ db }) => {
    // R13: at most one active application per customer
    const [existingActive] = await db
      .select()
      .from(applications)
      .where(and(eq(applications.customerId, actor.customerId!), eq(applications.isActive, true)))
      .limit(1);

    if (existingActive) {
      return existingActive;
    }

    const [cust] = await db
      .select({ sourceCode: customers.sourceCode })
      .from(customers)
      .where(eq(customers.id, actor.customerId!))
      .limit(1);

    let lenderId: string | null = null;
    let financingEligible = false;
    let employerSchemeId: string | null = null;
    let employeeNumber: string | null = null;
    let yearsInService: number | null = null;
    let platform: "uber" | "bolt" | "little" | "other" | null = null;
    let platformOther: string | null = null;

    if (input.product === "RIDE_HAILING") {
      if (!input.platform) {
        throw new DomainError("VALIDATION_ERROR", "Select the ride-hailing platform you drive for.", 400);
      }
      platform = input.platform;
      platformOther = input.platform === "other" ? (input.platformOther?.trim() || null) : null;
      financingEligible = true;

      // R14: resolve lender strictly server-side from products config
      const [prod] = await db
        .select({ fixedLenderId: products.fixedLenderId })
        .from(products)
        .where(eq(products.code, "RIDE_HAILING"))
        .limit(1);
      lenderId = prod?.fixedLenderId ?? null;
    } else {
      if (!input.employerId || !input.employeeNumber?.trim()) {
        throw new DomainError(
          "VALIDATION_ERROR",
          "Select your employer and enter your employee number.",
          400,
        );
      }
      const today = formatInTimeZone(new Date(), NAIROBI_TIMEZONE, "yyyy-MM-dd");
      const [scheme] = await db
        .select()
        .from(employerSchemes)
        .where(
          and(
            eq(employerSchemes.employerId, input.employerId),
            eq(employerSchemes.status, "active"),
            lte(employerSchemes.effectiveFrom, today),
            or(isNull(employerSchemes.effectiveTo), gte(employerSchemes.effectiveTo, today)),
          ),
        )
        .limit(1);

      if (!scheme) {
        throw new DomainError(
          "VALIDATION_ERROR",
          "Your employer is not registered or you are not on the eligible list.",
          400,
        );
      }

      const empNoNormalized = input.employeeNumber.trim().toUpperCase();
      const [eligible] = await db
        .select()
        .from(employerEligibleEmployees)
        .where(
          and(
            eq(employerEligibleEmployees.schemeId, scheme.id),
            eq(employerEligibleEmployees.active, true),
            sql`upper(${employerEligibleEmployees.employeeNumber}) = ${empNoNormalized}`,
          ),
        )
        .limit(1);

      if (!eligible) {
        throw new DomainError(
          "VALIDATION_ERROR",
          "Your employer is not registered or you are not on the eligible list.",
          400,
        );
      }

      // R14: salaried lender always comes from the scheme, never Fund Flow or client input
      employerSchemeId = scheme.id;
      lenderId = scheme.lenderId;
      employeeNumber = eligible.employeeNumber;
      yearsInService = eligible.yearsInService;
      financingEligible = true;
    }

    const [created] = await db
      .insert(applications)
      .values({
        customerId: actor.customerId!,
        productCode: input.product,
        lenderId,
        employerSchemeId,
        employeeNumber,
        yearsInService,
        platform,
        platformOther,
        status: "DRAFT",
        financingEligible,
        depositKes: 0,
        sourceCode: cust?.sourceCode ?? null,
        isActive: true,
      })
      .returning();

    await db.insert(statusHistory).values({
      applicationId: created.id,
      fromStatus: null,
      toStatus: "DRAFT",
      actorUserId: actor.userId,
      actorType: "customer",
      meta: { product: input.product },
    });

    await audit({
      db,
      actor,
      action: "application.started",
      entityType: "application",
      entityId: created.id,
      meta: { product: input.product, financingEligible },
    });

    await enqueueNotification(db, {
      type: "application.started",
      userId: actor.userId,
      applicationId: created.id,
      payload: { product: input.product },
      dedupeKey: `application.started:${created.id}`,
    });

    return created;
  });
}

export async function getApplicationForStep(actor: Actor, applicationId: string) {
  const [app] = await getDb()
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);

  if (!app) {
    throw new DomainError("NOT_FOUND", "Application not found.", 404);
  }
  authorize(actor, "application:read", { customerId: app.customerId });
  return app;
}

export async function submitDetailsService(
  actor: Actor,
  input: {
    applicationId: string;
    nationalId: string;
    regNo: string;
    makeModel: string;
    year?: number;
    faultDescription: string;
    platformRating?: number;
    consentAccepted: boolean;
  },
) {
  const existing = await getApplicationForStep(actor, input.applicationId);
  authorize(actor, "application:update_details", { customerId: existing.customerId });

  if (!input.consentAccepted) {
    throw new DomainError("VALIDATION_ERROR", "Accept the Consent Notice to continue.", 400);
  }

  const normalizedRegNo = input.regNo.trim().toUpperCase().replace(/\s+/g, "");
  if (normalizedRegNo.length < 5) {
    throw new DomainError("VALIDATION_ERROR", "Enter a valid vehicle registration plate.", 400);
  }

  const nationalIdClean = input.nationalId.trim();
  const nationalIdEnc = encryptField(nationalIdClean);
  const nationalIdHash = hmacHash(nationalIdClean);

  return withActor(actor, async ({ db }) => {
    await db
      .update(customers)
      .set({
        nationalIdEnc,
        nationalIdHash,
        updatedAt: new Date(),
      })
      .where(eq(customers.id, existing.customerId));

    let vehicleId = existing.vehicleId;
    if (vehicleId) {
      await db
        .update(vehicles)
        .set({
          regNo: normalizedRegNo,
          makeModel: input.makeModel.trim(),
          year: input.year ?? null,
          updatedAt: new Date(),
        })
        .where(eq(vehicles.id, vehicleId));
    } else {
      const [createdVehicle] = await db
        .insert(vehicles)
        .values({
          customerId: existing.customerId,
          regNo: normalizedRegNo,
          makeModel: input.makeModel.trim(),
          year: input.year ?? null,
        })
        .returning();
      vehicleId = createdVehicle.id;
    }

    // Assign reference AAP/FNPL/YYYY/NNNN in the same transaction as consent
    let reference = existing.reference;
    if (!reference) {
      const refResult = await db.execute(sql`SELECT next_reference() AS ref`);
      const row = refResult[0] as { ref?: string } | undefined;
      if (!row?.ref) {
        throw new DomainError("INTERNAL_ERROR", "Could not assign application reference.", 500);
      }
      reference = row.ref;
    }

    await db.insert(consents).values({
      customerId: existing.customerId,
      applicationId: existing.id,
      noticeVersion: CONSENT_NOTICE_VERSION,
      textSha256: sha256Hex(CONSENT_NOTICE_TEXT),
      ip: actor.ip ?? null,
      userAgent: actor.userAgent ?? null,
    });

    const [updated] = await db
      .update(applications)
      .set({
        reference,
        vehicleId,
        faultDescription: input.faultDescription.trim(),
        platformRating:
          input.platformRating !== undefined ? input.platformRating.toFixed(1) : existing.platformRating,
        updatedAt: new Date(),
      })
      .where(eq(applications.id, existing.id))
      .returning();

    await audit({
      db,
      actor,
      action: "application.details_submitted",
      entityType: "application",
      entityId: existing.id,
      meta: { reference },
    });

    return updated;
  });
}

export interface AvailableSlot {
  slotStartIso: string;
  slotEndIso: string;
  label: string;
  available: boolean;
}

export async function listActiveGarages() {
  return getDb().select().from(garages).where(eq(garages.active, true));
}

export async function getAvailableSlots(garageId: string): Promise<AvailableSlot[]> {
  const now = new Date();
  const slotHours = [9, 11, 14, 16];
  const slots: AvailableSlot[] = [];

  const existingBookings = await getDb()
    .select({ slotStart: bookings.slotStart })
    .from(bookings)
    .where(and(eq(bookings.garageId, garageId), eq(bookings.status, "booked"), gte(bookings.slotStart, now)));

  const bookedCountByIso = new Map<string, number>();
  for (const b of existingBookings) {
    const key = b.slotStart.toISOString();
    bookedCountByIso.set(key, (bookedCountByIso.get(key) ?? 0) + 1);
  }

  for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
    const candidateDay = addDays(now, dayOffset);
    const dayOfWeek = formatInTimeZone(candidateDay, NAIROBI_TIMEZONE, "i"); // 1=Mon .. 7=Sun
    if (dayOfWeek === "7") continue; // Skip Sunday

    const dateStr = formatInTimeZone(candidateDay, NAIROBI_TIMEZONE, "yyyy-MM-dd");
    const displayDay = formatInTimeZone(candidateDay, NAIROBI_TIMEZONE, "EEE d MMM");

    for (const hour of slotHours) {
      const startUtc = fromZonedTime(
        `${dateStr} ${String(hour).padStart(2, "0")}:00:00`,
        NAIROBI_TIMEZONE,
      );
      const endUtc = fromZonedTime(
        `${dateStr} ${String(hour + 1).padStart(2, "0")}:30:00`,
        NAIROBI_TIMEZONE,
      );
      const count = bookedCountByIso.get(startUtc.toISOString()) ?? 0;
      slots.push({
        slotStartIso: startUtc.toISOString(),
        slotEndIso: endUtc.toISOString(),
        label: `${displayDay}, ${String(hour).padStart(2, "0")}:00 EAT`,
        available: count < 3,
      });
    }
  }

  return slots;
}

export async function createBookingAndInitiateFeeService(
  actor: Actor,
  input: {
    applicationId: string;
    garageId: string;
    slotStartIso: string;
    slotEndIso: string;
    depositKes: number;
    mpesaPhone: string;
  },
) {
  const existing = await getApplicationForStep(actor, input.applicationId);
  authorize(actor, "application:book", { customerId: existing.customerId });

  if (!existing.reference) {
    throw new DomainError(
      "VALIDATION_ERROR",
      "Complete your vehicle details and consent before booking.",
      400,
    );
  }

  const normalizedPhone = normalizeKenyanPhone(input.mpesaPhone);
  if (!normalizedPhone) {
    throw new DomainError("VALIDATION_ERROR", "Enter a valid Kenyan M-Pesa phone number.", 400);
  }

  const feeKes = await getInspectionFeeSetting();
  const mpesa = getMpesaProvider();
  const stkResponse = await mpesa.initiateStkPush({
    amountKes: feeKes,
    phoneE164: normalizedPhone,
    accountReference: "531974",
    description: "FNPL inspection",
  });

  return withActor(actor, async ({ db }) => {
    const deposit = Math.max(0, Math.round(input.depositKes));
    await db
      .update(applications)
      .set({ depositKes: deposit, updatedAt: new Date() })
      .where(eq(applications.id, existing.id));

    const [existingBooking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.applicationId, existing.id))
      .limit(1);

    if (existingBooking) {
      await db
        .update(bookings)
        .set({
          garageId: input.garageId,
          slotStart: new Date(input.slotStartIso),
          slotEnd: new Date(input.slotEndIso),
          status: "booked",
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, existingBooking.id));
    } else {
      await db.insert(bookings).values({
        applicationId: existing.id,
        garageId: input.garageId,
        slotStart: new Date(input.slotStartIso),
        slotEnd: new Date(input.slotEndIso),
        status: "booked",
      });
    }

    const [payment] = await db
      .insert(feePayments)
      .values({
        applicationId: existing.id,
        amountKes: feeKes,
        msisdnHash: hmacHash(normalizedPhone),
        msisdnLast4: normalizedPhone.slice(-4),
        checkoutRequestId: stkResponse.checkoutRequestId,
        merchantRequestId: stkResponse.merchantRequestId,
        status: "pending",
      })
      .returning();

    return {
      paymentId: payment.id,
      checkoutRequestId: stkResponse.checkoutRequestId,
      customerMessage: stkResponse.customerMessage,
      feeKes,
      reference: existing.reference,
    };
  });
}

export async function processStkCallbackService(params: {
  checkoutRequestId: string;
  resultCode: string | number;
  resultDesc: string;
  amountKes?: number;
  mpesaReceipt?: string;
  rawCallback: Record<string, unknown>;
  customerUserId?: string | null;
}) {
  const db = getDb();
  const [payment] = await db
    .select()
    .from(feePayments)
    .where(eq(feePayments.checkoutRequestId, params.checkoutRequestId))
    .limit(1);

  if (!payment || !payment.applicationId) {
    throw new DomainError("NOT_FOUND", "Payment request not found.", 404);
  }

  // Idempotent: already paid
  if (payment.status === "paid") {
    return { status: "paid" as const, message: "Payment already confirmed." };
  }

  const codeStr = String(params.resultCode);
  const now = new Date();

  if (codeStr !== "0") {
    const nextStatus = codeStr === "1037" ? "expired" : "failed";
    await db
      .update(feePayments)
      .set({
        status: nextStatus,
        resultCode: codeStr,
        resultDesc: params.resultDesc,
        rawCallback: params.rawCallback,
        updatedAt: now,
      })
      .where(eq(feePayments.id, payment.id));

    return {
      status: nextStatus,
      message: friendlyMpesaResultMessage(codeStr),
    };
  }

  const expectedFee = await getInspectionFeeSetting();
  if (params.amountKes !== undefined && Math.round(params.amountKes) !== expectedFee) {
    throw new DomainError(
      "VALIDATION_ERROR",
      `Received amount (${params.amountKes}) does not match expected fee (${expectedFee}).`,
      400,
    );
  }

  const receipt = params.mpesaReceipt ?? `MP${Date.now().toString().slice(-8)}`;

  return withActor(SYSTEM_ACTOR, async ({ db: tx }) => {
    await tx
      .update(feePayments)
      .set({
        status: "paid",
        mpesaReceipt: receipt,
        resultCode: "0",
        resultDesc: params.resultDesc,
        rawCallback: params.rawCallback,
        paidAt: now,
        updatedAt: now,
      })
      .where(eq(feePayments.id, payment.id));

    const updatedApp = await transition({
      db: tx,
      applicationId: payment.applicationId!,
      to: "BOOKED",
      actor: SYSTEM_ACTOR,
      meta: { mpesaReceipt: receipt, feePaymentId: payment.id },
      customerUserId: params.customerUserId,
    });

    return {
      status: "paid" as const,
      message: "Payment confirmed and inspection booked.",
      reference: updatedApp.reference,
    };
  });
}

export async function getApplicationTrackerData(actor: Actor, reference: string) {
  const db = getDb();
  const [app] = await db
    .select()
    .from(applications)
    .where(eq(applications.reference, reference))
    .limit(1);

  if (!app) {
    throw new DomainError("NOT_FOUND", "Application not found.", 404);
  }

  authorize(actor, "application:read", {
    customerId: app.customerId,
    lenderId: app.lenderId,
  });

  const [vehicleRows, bookingRows, historyRows, docRows, feeRows, lenderRows, fundsRows] =
    await Promise.all([
      app.vehicleId
        ? db.select().from(vehicles).where(eq(vehicles.id, app.vehicleId)).limit(1)
        : Promise.resolve([]),
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
        .from(statusHistory)
        .where(eq(statusHistory.applicationId, app.id))
        .orderBy(desc(statusHistory.createdAt)),
      db
        .select()
        .from(documents)
        .where(eq(documents.applicationId, app.id))
        .orderBy(desc(documents.createdAt)),
      db
        .select()
        .from(feePayments)
        .where(eq(feePayments.applicationId, app.id))
        .orderBy(desc(feePayments.createdAt))
        .limit(1),
      app.lenderId
        ? db.select({ name: lenders.name }).from(lenders).where(eq(lenders.id, app.lenderId)).limit(1)
        : Promise.resolve([]),
      db
        .select({ recordedAt: paymentAttestations.recordedAt })
        .from(paymentAttestations)
        .where(
          and(
            eq(paymentAttestations.applicationId, app.id),
            eq(paymentAttestations.kind, "funds_received"),
          ),
        )
        .limit(1),
    ]);

  const fundsRow = fundsRows[0] ?? null;

  return {
    application: app,
    vehicle: vehicleRows[0] ?? null,
    booking: bookingRows[0] ?? null,
    history: historyRows,
    documents: docRows,
    latestFeePayment: feeRows[0] ?? null,
    lenderName: lenderRows[0]?.name ?? null,
    fundsAcknowledged: Boolean(fundsRow),
    fundsAcknowledgedAt: fundsRow?.recordedAt ?? null,
  };
}

export async function cancelApplicationService(
  actor: Actor,
  applicationId: string,
  reason: string,
) {
  const existing = await getApplicationForStep(actor, applicationId);
  authorize(actor, "application:cancel", { customerId: existing.customerId });

  return withActor(actor, async ({ db }) =>
    transition({
      db,
      applicationId: existing.id,
      to: "CANCELLED",
      actor,
      reason,
      customerUserId: actor.userId,
    }),
  );
}

export async function buildIndicativeEstimate(depositKes = 0) {
  const config = await getDailyEstimateConfigSetting();
  return estimateDailyRepayment({ depositKes, config });
}
