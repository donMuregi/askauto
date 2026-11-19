"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isDomainError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { requireStaff } from "@/server/auth/guards";
import {
  approveScopeVarianceService,
  claimTaskService,
  forwardToLenderService,
  moveToCashRouteService,
  releaseReportAsOpsService,
  returnReportAsOpsService,
  reviewDocumentService,
  saveOpsChecklistService,
} from "@/server/domain/review/service";

export interface OpsActionResult {
  ok: boolean;
  message?: string;
  error?: string;
}

function mapErr(err: unknown): OpsActionResult {
  if (isDomainError(err)) {
    return { ok: false, error: err.message };
  }
  logger.error({ err }, "unexpected ops action error");
  return { ok: false, error: "Action failed. Try again." };
}

export async function claimTaskAction(applicationId: string): Promise<OpsActionResult> {
  try {
    const ctx = await requireStaff(["ops_reviewer", "ops_approver", "admin"], { mode: "throw" });
    await claimTaskService(ctx.actor, applicationId);
    revalidatePath("/admin");
    revalidatePath("/admin/review");
    return { ok: true, message: "Application assigned to you." };
  } catch (err) {
    return mapErr(err);
  }
}

export async function releaseReportAction(applicationId: string): Promise<OpsActionResult> {
  try {
    const ctx = await requireStaff(["ops_reviewer", "ops_approver", "admin"], { mode: "throw" });
    await releaseReportAsOpsService(ctx.actor, applicationId);
    revalidatePath("/admin");
    revalidatePath("/admin/review");
    return { ok: true, message: "Diagnostic report released to customer." };
  } catch (err) {
    return mapErr(err);
  }
}

export async function returnReportAction(
  applicationId: string,
  reason: string,
): Promise<OpsActionResult> {
  try {
    const ctx = await requireStaff(["ops_reviewer", "ops_approver", "admin"], { mode: "throw" });
    await returnReportAsOpsService(ctx.actor, applicationId, reason);
    revalidatePath("/admin");
    revalidatePath("/admin/review");
    revalidatePath("/assessor");
    return { ok: true, message: "Report returned to assessor with notes." };
  } catch (err) {
    return mapErr(err);
  }
}

export async function approveScopeVarianceAction(scopeId: string): Promise<OpsActionResult> {
  try {
    const ctx = await requireStaff(["ops_approver", "admin"], { mode: "throw" });
    await approveScopeVarianceService(ctx.actor, scopeId);
    revalidatePath("/admin/review");
    return { ok: true, message: "Scope price variance approved." };
  } catch (err) {
    return mapErr(err);
  }
}

const reviewDocumentSchema = z.object({
  uploadId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  reasonCode: z.string().optional(),
  note: z.string().max(500).optional(),
});

export async function reviewDocumentAction(
  payload: z.input<typeof reviewDocumentSchema>,
): Promise<OpsActionResult> {
  const parsed = reviewDocumentSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid review input." };
  }

  try {
    const ctx = await requireStaff(["ops_reviewer", "ops_approver", "admin"], { mode: "throw" });
    await reviewDocumentService(ctx.actor, parsed.data);
    revalidatePath("/admin");
    revalidatePath("/admin/review");
    return {
      ok: true,
      message:
        parsed.data.decision === "approved"
          ? "Document approved."
          : "Document rejected and customer notified to re-upload.",
    };
  } catch (err) {
    return mapErr(err);
  }
}

const checklistSchema = z.object({
  applicationId: z.string().uuid(),
  namesMatch: z.boolean(),
  nothingMissing: z.boolean(),
  legible: z.boolean(),
  eligibilityChecked: z.boolean(),
  deductionHeadroomChecked: z.boolean(),
  priceCheckPassed: z.boolean(),
});

export async function saveOpsChecklistAction(
  payload: z.input<typeof checklistSchema>,
): Promise<OpsActionResult> {
  const parsed = checklistSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: "Invalid checklist input." };
  }

  try {
    const ctx = await requireStaff(["ops_reviewer", "ops_approver", "admin"], { mode: "throw" });
    const res = await saveOpsChecklistService(ctx.actor, parsed.data);
    revalidatePath("/admin/review");
    return {
      ok: true,
      message: res.checklistPassed
        ? "Ops checklist and price check passed."
        : "Checklist saved (remaining items still pending).",
    };
  } catch (err) {
    return mapErr(err);
  }
}

export async function forwardToLenderAction(applicationId: string): Promise<OpsActionResult> {
  try {
    const ctx = await requireStaff(["ops_reviewer", "ops_approver", "admin"], { mode: "throw" });
    const res = await forwardToLenderService(ctx.actor, applicationId);
    revalidatePath("/admin");
    revalidatePath("/admin/review");
    revalidatePath("/lender");
    return {
      ok: true,
      message: `Package v${res.packageVersion} frozen and forwarded to the financing partner.`,
    };
  } catch (err) {
    return mapErr(err);
  }
}

export async function moveToCashRouteAction(
  applicationId: string,
  reason: string,
): Promise<OpsActionResult> {
  try {
    const ctx = await requireStaff(["ops_reviewer", "ops_approver", "admin"], { mode: "throw" });
    await moveToCashRouteService(ctx.actor, applicationId, reason);
    revalidatePath("/admin");
    revalidatePath("/admin/review");
    return { ok: true, message: "Application moved to cash/deposit route." };
  } catch (err) {
    return mapErr(err);
  }
}
