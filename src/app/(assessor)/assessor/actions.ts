"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isDomainError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { requireStaff } from "@/server/auth/guards";
import {
  saveInspectionService,
  saveRepairScopeService,
} from "@/server/domain/inspections/service";

export interface AssessorActionResult {
  ok: boolean;
  message?: string;
  error?: string;
  inspectionId?: string;
  scopeId?: string;
}

function handleError(err: unknown): AssessorActionResult {
  if (isDomainError(err)) {
    return { ok: false, error: err.message };
  }
  logger.error({ err }, "unexpected assessor action error");
  return { ok: false, error: "Could not save changes. Try again." };
}

const findingSchema = z.object({
  componentCode: z.string().min(1),
  componentLabel: z.string().min(1),
  findingText: z.string().trim().min(2, "Enter a finding description."),
  recommendedAction: z.string().trim().min(2, "Enter a recommended action."),
  urgency: z.enum([
    "do_not_delay",
    "within_1_month",
    "with_the_above",
    "three_to_four_months",
    "monitor",
    "no_action",
  ]),
});

const photoSchema = z.object({
  kind: z.string().min(1),
  storageKey: z.string().min(1),
  capturedAtIso: z.string().min(1),
  sha256: z.string().min(8),
  lat: z.string().nullable().optional(),
  lng: z.string().nullable().optional(),
  accuracyM: z.number().int().nullable().optional(),
});

const saveInspectionSchema = z.object({
  applicationId: z.string().uuid(),
  mileageKm: z.coerce.number().int().min(0, "Enter a valid odometer reading."),
  durationMinutes: z.coerce.number().int().min(1).max(600).default(45),
  diagnosticsRun: z.array(z.string()).default([]),
  faultCodes: z.array(z.string()).default([]),
  fuelTransmissionNote: z.string().max(500).optional(),
  findings: z.array(findingSchema),
  photos: z.array(photoSchema).optional(),
  submitReport: z.boolean().default(false),
});

export async function saveInspectionAction(
  payload: z.input<typeof saveInspectionSchema>,
): Promise<AssessorActionResult> {
  const parsed = saveInspectionSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your inspection details." };
  }

  try {
    const ctx = await requireStaff(["assessor", "ops_reviewer", "ops_approver", "admin"], {
      mode: "throw",
    });
    const res = await saveInspectionService(ctx.actor, parsed.data);
    revalidatePath("/assessor");
    revalidatePath(`/assessor/inspections/${parsed.data.applicationId}`);
    return {
      ok: true,
      inspectionId: res.inspectionId,
      message: parsed.data.submitReport
        ? "Diagnostic report submitted. You can now fill in the repair scope."
        : "Inspection draft saved.",
    };
  } catch (err) {
    return handleError(err);
  }
}

const scopeItemSchema = z.object({
  serviceId: z.string().uuid("Select a valid service from the catalogue."),
  description: z.string().trim().min(2, "Enter a work description."),
  partGrade: z.enum(["OEM", "aftermarket", "none"]),
  partBrand: z.string().trim().max(80).optional(),
  partsKes: z.coerce.number().int().min(0),
  labourKes: z.coerce.number().int().min(0),
});

const saveRepairScopeSchema = z.object({
  applicationId: z.string().uuid(),
  items: z.array(scopeItemSchema).min(1, "Add at least one repair scope item."),
  sendToCustomer: z.boolean().default(false),
});

export async function saveRepairScopeAction(
  payload: z.input<typeof saveRepairScopeSchema>,
): Promise<AssessorActionResult> {
  const parsed = saveRepairScopeSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your repair scope items." };
  }

  try {
    const ctx = await requireStaff(["assessor", "ops_reviewer", "ops_approver", "admin"], {
      mode: "throw",
    });
    const res = await saveRepairScopeService(ctx.actor, parsed.data);
    revalidatePath("/assessor");
    revalidatePath(`/assessor/inspections/${parsed.data.applicationId}`);
    revalidatePath("/account");
    return {
      ok: true,
      scopeId: res.scopeId,
      message: parsed.data.sendToCustomer
        ? "Repair scope sent to the customer for approval."
        : "Repair scope draft saved.",
    };
  } catch (err) {
    return handleError(err);
  }
}
