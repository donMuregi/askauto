"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isDomainError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { requireStaff } from "@/server/auth/guards";
import {
  addRecommendationService,
  deleteRecommendationService,
  recordGarageHandoverService,
  updateArrivalAndStartJobService,
  updateJobCardLineService,
} from "@/server/domain/garage/service";

export interface GarageActionResult {
  ok: boolean;
  message?: string;
  error?: string;
}

function mapErr(err: unknown): GarageActionResult {
  if (isDomainError(err)) {
    return { ok: false, error: err.message };
  }
  logger.error({ err }, "unexpected garage action error");
  return { ok: false, error: "Action failed. Try again." };
}

const checkInSchema = z.object({
  jobId: z.string().uuid(),
  mileageIn: z.coerce.number().int().min(0, "Enter a valid mileage reading."),
  fuelLevel: z.string().min(1).max(40),
  bodyCondition: z.string().min(1).max(200),
  trackerPresent: z.boolean(),
  spareWheel: z.boolean(),
  dashboardWarnings: z.string().max(300),
  notes: z.string().max(500).optional(),
});

export async function checkInVehicleAction(
  payload: z.input<typeof checkInSchema>,
): Promise<GarageActionResult> {
  const parsed = checkInSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check arrival details." };
  }

  try {
    const ctx = await requireStaff(["garage", "admin", "ops_reviewer", "ops_approver"], {
      mode: "throw",
    });
    await updateArrivalAndStartJobService(ctx.actor, parsed.data);
    revalidatePath("/garage");
    revalidatePath(`/garage/jobs/${parsed.data.jobId}`);
    return { ok: true, message: "Vehicle check-in saved and job marked in progress." };
  } catch (err) {
    return mapErr(err);
  }
}

const updateLineSchema = z.object({
  jobId: z.string().uuid(),
  lineId: z.string().uuid(),
  technicianName: z.string().max(120),
  partFitted: z.string().max(200),
  grade: z.string().max(80),
  warrantyToDate: z.string().optional(),
  warrantyToKm: z.coerce.number().int().min(0).optional().nullable(),
  completed: z.boolean(),
});

export async function updateJobLineAction(
  payload: z.input<typeof updateLineSchema>,
): Promise<GarageActionResult> {
  const parsed = updateLineSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check repair line input." };
  }

  try {
    const ctx = await requireStaff(["garage", "admin", "ops_reviewer", "ops_approver"], {
      mode: "throw",
    });
    await updateJobCardLineService(ctx.actor, parsed.data);
    revalidatePath("/garage");
    revalidatePath(`/garage/jobs/${parsed.data.jobId}`);
    revalidatePath("/account");
    return {
      ok: true,
      message: parsed.data.completed ? "Repair line marked completed." : "Repair line updated.",
    };
  } catch (err) {
    return mapErr(err);
  }
}

const addRecSchema = z.object({
  jobId: z.string().uuid(),
  finding: z.string().trim().min(3, "Describe the advisory recommendation.").max(500),
  urgency: z.enum([
    "do_not_delay",
    "within_1_month",
    "with_the_above",
    "three_to_four_months",
    "monitor",
    "no_action",
  ]),
  reminderOn: z.string().optional(),
});

export async function addRecommendationAction(
  payload: z.input<typeof addRecSchema>,
): Promise<GarageActionResult> {
  const parsed = addRecSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check recommendation input." };
  }

  try {
    const ctx = await requireStaff(["garage", "admin", "ops_reviewer", "ops_approver"], {
      mode: "throw",
    });
    await addRecommendationService(ctx.actor, parsed.data);
    revalidatePath(`/garage/jobs/${parsed.data.jobId}`);
    return { ok: true, message: "Recommendation logged." };
  } catch (err) {
    return mapErr(err);
  }
}

export async function deleteRecommendationAction(
  jobId: string,
  recommendationId: string,
): Promise<GarageActionResult> {
  try {
    const ctx = await requireStaff(["garage", "admin", "ops_reviewer", "ops_approver"], {
      mode: "throw",
    });
    await deleteRecommendationService(ctx.actor, recommendationId);
    revalidatePath(`/garage/jobs/${jobId}`);
    return { ok: true, message: "Recommendation removed." };
  } catch (err) {
    return mapErr(err);
  }
}

const handoverSchema = z.object({
  jobId: z.string().uuid(),
  mileageOut: z.coerce.number().int().positive("Enter a valid mileage-out reading."),
  roadTestKm: z.coerce.number().int().min(0).optional().nullable(),
  roadTestResult: z.string().trim().min(2, "Record the road test result.").max(300),
  walkthroughDone: z.boolean(),
  partsReturned: z.boolean(),
  nextServiceKm: z.coerce.number().int().positive().optional().nullable(),
  nextServiceDate: z.string().optional(),
  completeOnSite: z.boolean(),
  customerTypedName: z.string().max(120).optional(),
});

export async function recordHandoverAction(
  payload: z.input<typeof handoverSchema>,
): Promise<GarageActionResult> {
  const parsed = handoverSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check handover details." };
  }

  try {
    const ctx = await requireStaff(["garage", "admin", "ops_reviewer", "ops_approver"], {
      mode: "throw",
    });
    const res = await recordGarageHandoverService(ctx.actor, parsed.data);
    revalidatePath("/garage");
    revalidatePath(`/garage/jobs/${parsed.data.jobId}`);
    revalidatePath("/account");
    revalidatePath("/lender");
    revalidatePath("/admin");

    return {
      ok: true,
      message: res.completed
        ? `Handover completed (${res.certificateDocNumber}). Application moved to REPAYING.`
        : "QA sign-off saved. Customer can now confirm vehicle collection in their account.",
    };
  } catch (err) {
    return mapErr(err);
  }
}
