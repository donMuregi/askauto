import { and, eq, sql } from "drizzle-orm";
import { TERMINAL_APPLICATION_STATUSES } from "@/lib/constants";
import { DomainError } from "@/lib/errors";
import type { DbOrTx } from "@/server/db/client";
import type { Actor, StaffRole } from "@/server/db/rls";
import {
  applications,
  bookings,
  consents,
  feePayments,
  inspections,
  paymentAttestations,
  statusHistory,
} from "@/server/db/schema";
import { audit } from "@/server/domain/audit";
import { enqueueNotification } from "@/server/domain/notifications/outbox";

export type ApplicationStatus = (typeof applications.$inferSelect)["status"];

export const CUSTOMER_STATUS_LABELS: Record<ApplicationStatus, string> = {
  DRAFT: "Application started",
  BOOKED: "Booked",
  REPORT_SUBMITTED: "Booked (inspection done, report being checked)",
  REPORT_READY: "Report ready",
  SCOPE_SENT: "Report ready (scope waiting for your approval)",
  REPAIR_APPROVED: "Repair approved (upload your documents)",
  UNDER_REVIEW: "Under review",
  WITH_LENDER: "With financing partner",
  OFFER_MADE: "With financing partner (offer ready for you)",
  APPROVED: "Approved",
  REPAIR_IN_PROGRESS: "Repair in progress",
  REPAYING: "Repaying",
  SETTLED: "Settled",
  DECLINED: "Not approved (options available)",
  CASH_ROUTE: "Cash or deposit route",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
};

export const STATUS_TO_STEP: Record<ApplicationStatus, number> = {
  DRAFT: 4,
  BOOKED: 5,
  REPORT_SUBMITTED: 6,
  REPORT_READY: 6,
  SCOPE_SENT: 7,
  REPAIR_APPROVED: 8,
  UNDER_REVIEW: 9,
  WITH_LENDER: 9,
  OFFER_MADE: 10,
  APPROVED: 10,
  REPAIR_IN_PROGRESS: 12,
  REPAYING: 13,
  SETTLED: 14,
  DECLINED: 10,
  CASH_ROUTE: 9,
  CANCELLED: 4,
  EXPIRED: 4,
};

export const JOURNEY_STAGES = [
  { id: "A", label: "Find and book", steps: [1, 2, 3, 4, 5] },
  { id: "B", label: "Inspect and approve", steps: [6, 7] },
  { id: "C", label: "Apply", steps: [8, 9] },
  { id: "D", label: "Decide and pay out", steps: [10, 11] },
  { id: "E", label: "Repair and repay", steps: [12, 13, 14] },
] as const;

export function getWhatHappensNext(
  status: ApplicationStatus,
  productCode: "RIDE_HAILING" | "SALARIED",
): string {
  switch (status) {
    case "DRAFT":
      return "Complete your details and book your inspection slot.";
    case "BOOKED":
      return "Bring your vehicle to Ask AutoParts Garage at your booked slot for inspection.";
    case "REPORT_SUBMITTED":
      return "Your inspection is complete and the diagnostic report is being reviewed by our team.";
    case "REPORT_READY":
      return "View your diagnostic report while our team prepares your priced repair scope.";
    case "SCOPE_SENT":
      return "Review your priced repair scope and sign only for the work you want done.";
    case "REPAIR_APPROVED":
      return productCode === "SALARIED"
        ? "Upload your national ID and sign the payroll deduction consent to submit."
        : "Upload your required documents so we can review and forward your application.";
    case "UNDER_REVIEW":
      return "Our team is checking your documents and repair pricing.";
    case "WITH_LENDER":
      return "Your financing partner is reviewing your application package.";
    case "OFFER_MADE":
      return "Review your financing offer terms and accept to proceed.";
    case "APPROVED":
      return "Your financing partner is confirming payment approval to Ask AutoParts.";
    case "REPAIR_IN_PROGRESS":
      return "Your vehicle is in repair at the garage. Follow Job Card updates here.";
    case "REPAYING":
      return productCode === "SALARIED"
        ? "Repayments run through monthly payroll deduction."
        : "Repay your financing partner directly by M-Pesa on your schedule.";
    case "SETTLED":
      return "Your financing is fully settled.";
    case "DECLINED":
      return "Choose to pay cash, request a smaller repair scope, or add a deposit.";
    case "CASH_ROUTE":
      return "Our team will assist you with a cash or deposit repair option.";
    case "CANCELLED":
      return "This application was cancelled. You can start a new application anytime.";
    case "EXPIRED":
      return "This application expired. You can start a new application anytime.";
  }
}

export type TransitionGuardResult =
  | { ok: true }
  | { ok: false; code: "GUARD_FAILED"; message: string };

interface TransitionRule {
  from: ApplicationStatus;
  to: ApplicationStatus;
  allowedActors: Array<"customer" | "system" | "lender" | StaffRole>;
  guard?: (params: {
    db: DbOrTx;
    application: typeof applications.$inferSelect;
    actor: Actor;
    reason?: string;
    meta?: Record<string, unknown>;
  }) => Promise<TransitionGuardResult>;
  events?: (params: {
    application: typeof applications.$inferSelect;
    meta?: Record<string, unknown>;
  }) => Array<{ type: string; dedupeKey: string; payload?: Record<string, unknown> }>;
}

const PRE_REPAIR_STATUSES: ApplicationStatus[] = [
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
  "DECLINED",
];

const TRANSITION_RULES: TransitionRule[] = [
  {
    from: "DRAFT",
    to: "BOOKED",
    allowedActors: ["system"],
    guard: async ({ db, application }) => {
      if (!application.reference) {
        return { ok: false, code: "GUARD_FAILED", message: "Application reference must be assigned." };
      }
      const [consentRow] = await db
        .select({ id: consents.id })
        .from(consents)
        .where(eq(consents.applicationId, application.id))
        .limit(1);
      if (!consentRow) {
        return { ok: false, code: "GUARD_FAILED", message: "Customer consent record is missing." };
      }
      const [bookingRow] = await db
        .select({ id: bookings.id })
        .from(bookings)
        .where(eq(bookings.applicationId, application.id))
        .limit(1);
      if (!bookingRow) {
        return { ok: false, code: "GUARD_FAILED", message: "Inspection booking is required." };
      }
      const [paidFee] = await db
        .select({ id: feePayments.id })
        .from(feePayments)
        .where(
          and(eq(feePayments.applicationId, application.id), eq(feePayments.status, "paid")),
        )
        .limit(1);
      if (!paidFee) {
        return { ok: false, code: "GUARD_FAILED", message: "Inspection fee payment is not paid." };
      }
      return { ok: true };
    },
    events: ({ application, meta }) => [
      {
        type: "fee.paid",
        dedupeKey: `fee.paid:${application.id}`,
        payload: { reference: application.reference, mpesaReceipt: meta?.mpesaReceipt ?? "" },
      },
      {
        type: "booking.confirmed",
        dedupeKey: `booking.confirmed:${application.id}`,
        payload: { reference: application.reference, mpesaReceipt: meta?.mpesaReceipt ?? "" },
      },
    ],
  },
  {
    from: "BOOKED",
    to: "BOOKED",
    allowedActors: ["customer", "ops_reviewer", "ops_approver", "admin"],
    events: ({ application }) => [
      {
        type: "booking.rescheduled",
        dedupeKey: `booking.rescheduled:${application.id}:${Date.now()}`,
        payload: { reference: application.reference },
      },
    ],
  },
  {
    from: "BOOKED",
    to: "REPORT_SUBMITTED",
    allowedActors: ["assessor", "admin"],
    guard: async ({ db, application }) => {
      const [insp] = await db
        .select({ id: inspections.id })
        .from(inspections)
        .where(eq(inspections.applicationId, application.id))
        .limit(1);
      if (!insp) {
        return { ok: false, code: "GUARD_FAILED", message: "Inspection record is required." };
      }
      return { ok: true };
    },
    events: ({ application }) => [
      {
        type: "inspection.submitted",
        dedupeKey: `inspection.submitted:${application.id}:${Date.now()}`,
        payload: { reference: application.reference },
      },
    ],
  },
  {
    from: "REPORT_SUBMITTED",
    to: "REPORT_READY",
    allowedActors: ["ops_reviewer", "ops_approver", "assessor", "admin"],
    events: ({ application }) => [
      {
        type: "report.ready",
        dedupeKey: `report.ready:${application.id}`,
        payload: { reference: application.reference },
      },
    ],
  },
  {
    from: "REPORT_SUBMITTED",
    to: "BOOKED",
    allowedActors: ["ops_reviewer", "ops_approver", "admin"],
    guard: async ({ reason }) =>
      reason && reason.trim().length > 0
        ? { ok: true }
        : { ok: false, code: "GUARD_FAILED", message: "A reason is required to return a report." },
    events: ({ application }) => [
      {
        type: "inspection.returned",
        dedupeKey: `inspection.returned:${application.id}:${Date.now()}`,
        payload: { reference: application.reference },
      },
    ],
  },
  {
    from: "REPORT_READY",
    to: "SCOPE_SENT",
    allowedActors: ["ops_reviewer", "ops_approver", "assessor", "admin"],
    events: ({ application }) => [
      {
        type: "scope.sent",
        dedupeKey: `scope.sent:${application.id}:${Date.now()}`,
        payload: { reference: application.reference },
      },
    ],
  },
  {
    from: "SCOPE_SENT",
    to: "SCOPE_SENT",
    allowedActors: ["ops_reviewer", "ops_approver", "assessor", "admin"],
    events: ({ application }) => [
      {
        type: "scope.revised",
        dedupeKey: `scope.revised:${application.id}:${Date.now()}`,
        payload: { reference: application.reference },
      },
    ],
  },
  {
    from: "SCOPE_SENT",
    to: "REPAIR_APPROVED",
    allowedActors: ["customer"],
    events: ({ application }) => [
      {
        type: "scope.signed",
        dedupeKey: `scope.signed:${application.id}`,
        payload: { reference: application.reference },
      },
    ],
  },
  {
    from: "REPAIR_APPROVED",
    to: "UNDER_REVIEW",
    allowedActors: ["customer"],
    events: ({ application }) => [
      {
        type: "documents.submitted",
        dedupeKey: `documents.submitted:${application.id}:${Date.now()}`,
        payload: { reference: application.reference },
      },
    ],
  },
  {
    from: "UNDER_REVIEW",
    to: "REPAIR_APPROVED",
    allowedActors: ["ops_reviewer", "ops_approver", "admin"],
    events: ({ application }) => [
      {
        type: "document.rejected",
        dedupeKey: `document.rejected:${application.id}:${Date.now()}`,
        payload: { reference: application.reference },
      },
    ],
  },
  {
    from: "UNDER_REVIEW",
    to: "WITH_LENDER",
    allowedActors: ["ops_reviewer", "ops_approver", "admin"],
    guard: async ({ application }) => {
      if (!application.financingEligible || !application.lenderId) {
        return {
          ok: false,
          code: "GUARD_FAILED",
          message: "Application is not eligible for lender forwarding.",
        };
      }
      return { ok: true };
    },
    events: ({ application }) => [
      {
        type: "application.with_lender",
        dedupeKey: `application.with_lender:${application.id}`,
        payload: { reference: application.reference },
      },
    ],
  },
  {
    from: "UNDER_REVIEW",
    to: "CASH_ROUTE",
    allowedActors: ["ops_reviewer", "ops_approver", "admin"],
  },
  {
    from: "WITH_LENDER",
    to: "WITH_LENDER",
    allowedActors: ["lender"],
    events: ({ application }) => [
      {
        type: "lender.info_requested",
        dedupeKey: `lender.info_requested:${application.id}:${Date.now()}`,
        payload: { reference: application.reference },
      },
    ],
  },
  {
    from: "WITH_LENDER",
    to: "OFFER_MADE",
    allowedActors: ["lender"],
    events: ({ application }) => [
      {
        type: "offer.made",
        dedupeKey: `offer.made:${application.id}`,
        payload: { reference: application.reference },
      },
    ],
  },
  {
    from: "WITH_LENDER",
    to: "DECLINED",
    allowedActors: ["lender"],
  },
  {
    from: "OFFER_MADE",
    to: "APPROVED",
    allowedActors: ["customer"],
    events: ({ application }) => [
      {
        type: "offer.accepted",
        dedupeKey: `offer.accepted:${application.id}`,
        payload: { reference: application.reference },
      },
    ],
  },
  {
    from: "OFFER_MADE",
    to: "DECLINED",
    allowedActors: ["customer"],
  },
  {
    from: "OFFER_MADE",
    to: "EXPIRED",
    allowedActors: ["system"],
  },
  {
    from: "APPROVED",
    to: "REPAIR_IN_PROGRESS",
    allowedActors: ["system"],
    guard: async ({ db, application }) => {
      // R4 & R10: requires BOTH lender_approval and funds_received attestations
      const attestations = await db
        .select({ kind: paymentAttestations.kind })
        .from(paymentAttestations)
        .where(eq(paymentAttestations.applicationId, application.id));

      const hasApproval = attestations.some((a) => a.kind === "lender_approval");
      const hasFunds = attestations.some((a) => a.kind === "funds_received");
      if (!hasApproval || !hasFunds) {
        return {
          ok: false,
          code: "GUARD_FAILED",
          message: "Both lender payment approval and receipt of funds attestations are required.",
        };
      }
      return { ok: true };
    },
  },
  {
    from: "REPAIR_IN_PROGRESS",
    to: "REPAYING",
    allowedActors: ["garage", "customer", "admin"],
  },
  {
    from: "REPAYING",
    to: "SETTLED",
    allowedActors: ["lender", "system"],
  },
  ...PRE_REPAIR_STATUSES.map(
    (from): TransitionRule => ({
      from,
      to: "CANCELLED",
      allowedActors: ["customer", "ops_reviewer", "ops_approver", "admin"],
      guard: async ({ reason }) =>
        reason && reason.trim().length >= 3
          ? { ok: true }
          : { ok: false, code: "GUARD_FAILED", message: "Provide a cancellation reason." },
    }),
  ),
  {
    from: "DRAFT",
    to: "EXPIRED",
    allowedActors: ["system"],
  },
];

export function isActorAllowedForRule(
  actor: Actor,
  allowed: TransitionRule["allowedActors"],
): boolean {
  if (actor.kind === "system") return allowed.includes("system");
  if (actor.kind === "customer") return allowed.includes("customer");
  if (actor.kind === "lender") return allowed.includes("lender");
  return actor.roles.some((r) => allowed.includes(r));
}

export function findTransitionRule(
  from: ApplicationStatus,
  to: ApplicationStatus,
): TransitionRule | undefined {
  return TRANSITION_RULES.find((r) => r.from === from && r.to === to);
}

export async function transition(params: {
  db: DbOrTx;
  applicationId: string;
  to: ApplicationStatus;
  substatus?: string | null;
  actor: Actor;
  reason?: string;
  meta?: Record<string, unknown>;
  customerUserId?: string | null;
}): Promise<typeof applications.$inferSelect> {
  const { db, applicationId, to, actor, reason, meta } = params;

  // Lock application row for update
  const rows = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .for("update");

  const current = rows[0];
  if (!current) {
    throw new DomainError("NOT_FOUND", "Application not found.", 404);
  }

  // Idempotent repeat check (except explicit self-transitions like BOOKED -> BOOKED reschedule)
  if (current.status === to && to !== "BOOKED" && to !== "SCOPE_SENT" && to !== "WITH_LENDER") {
    return current;
  }

  const rule = findTransitionRule(current.status, to);
  if (!rule) {
    throw new DomainError(
      "INVALID_TRANSITION",
      `Cannot transition application from ${current.status} to ${to}.`,
      400,
    );
  }

  if (!isActorAllowedForRule(actor, rule.allowedActors)) {
    throw new DomainError(
      "FORBIDDEN",
      "You do not have permission to perform this status change.",
      403,
    );
  }

  if (rule.guard) {
    const guardResult = await rule.guard({
      db,
      application: current,
      actor,
      reason,
      meta,
    });
    if (!guardResult.ok) {
      throw new DomainError(guardResult.code, guardResult.message, 400);
    }
  }

  const isTerminal = (TERMINAL_APPLICATION_STATUSES as readonly string[]).includes(to);
  const now = new Date();

  // Rule 5: only transition() sets app.allow_status_write = 'on' inside the transaction
  await db.execute(sql`SET LOCAL app.allow_status_write = 'on'`);

  const [updated] = await db
    .update(applications)
    .set({
      status: to,
      substatus: params.substatus !== undefined ? params.substatus : null,
      isActive: isTerminal ? false : current.isActive,
      cancelledReason: to === "CANCELLED" ? (reason ?? current.cancelledReason) : current.cancelledReason,
      updatedAt: now,
    })
    .where(eq(applications.id, applicationId))
    .returning();

  await db.insert(statusHistory).values({
    applicationId,
    fromStatus: current.status,
    toStatus: to,
    actorUserId: actor.userId,
    actorType: actor.kind,
    reason: reason ?? null,
    meta: meta ?? {},
  });

  await audit({
    db,
    actor,
    action: `application.status.${to.toLowerCase()}`,
    entityType: "application",
    entityId: applicationId,
    meta: { from: current.status, to, reason: reason ?? null, ...meta },
  });

  if (rule.events) {
    for (const evt of rule.events({ application: updated, meta })) {
      await enqueueNotification(db, {
        type: evt.type,
        userId: params.customerUserId ?? null,
        applicationId,
        payload: evt.payload ?? {},
        dedupeKey: evt.dedupeKey,
      });
    }
  }

  return updated;
}
