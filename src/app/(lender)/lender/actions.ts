"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isDomainError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { requireLender } from "@/server/auth/guards";
import { changePasswordSchema } from "@/server/auth/schemas";
import {
  changePasswordService,
  revokeOtherSessionsService,
  revokeSessionService,
} from "@/server/auth/service";
import {
  confirmSecondApprovalService,
  decideSubmissionService,
  recordLenderApprovalService,
  submitRepaymentReportService,
  uploadRepaymentCsvService,
} from "@/server/domain/lenders/service";

export interface LenderActionResult {
  ok: boolean;
  message?: string;
  error?: string;
  imported?: number;
  rowErrors?: Array<{ row: number; error: string }>;
}

function mapErr(err: unknown): LenderActionResult {
  if (isDomainError(err)) {
    return { ok: false, error: err.message };
  }
  logger.error({ err }, "unexpected lender action error");
  return { ok: false, error: "Could not complete this action. Try again." };
}

const decideSubmissionSchema = z.object({
  submissionId: z.string().uuid(),
  decision: z.enum(["approve", "decline", "request_info"]),
  approvedAmountKes: z.coerce.number().int().positive().optional(),
  installmentKes: z.coerce.number().int().positive().optional(),
  frequency: z.enum(["daily", "monthly"]).optional(),
  tenorCount: z.coerce.number().int().positive().optional(),
  rateText: z.string().max(120).optional(),
  feesText: z.string().max(200).optional(),
  validUntilIso: z.string().optional(),
  declineReasonCode: z.string().max(80).optional(),
  note: z.string().max(1000).optional(),
});

export async function decideSubmissionAction(
  payload: z.input<typeof decideSubmissionSchema>,
): Promise<LenderActionResult> {
  const parsed = decideSubmissionSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your decision details." };
  }

  try {
    const ctx = await requireLender("approver", { mode: "throw" });
    await decideSubmissionService(ctx.actor, parsed.data);
    revalidatePath("/lender");
    revalidatePath("/lender/inbox");
    revalidatePath("/lender/applications");
    revalidatePath("/account");
    revalidatePath("/admin");

    const message =
      parsed.data.decision === "approve"
        ? "Offer issued and sent to the customer."
        : parsed.data.decision === "decline"
          ? "Application declined and customer notified."
          : "Information request recorded and sent to Operations.";

    return { ok: true, message };
  } catch (err) {
    return mapErr(err);
  }
}

const recordLenderApprovalSchema = z.object({
  applicationId: z.string().uuid(),
  amountKes: z.coerce.number().int().positive("Enter a valid payment amount in KES."),
  reference: z.string().trim().min(2, "Enter the payment approval reference.").max(120),
  expectedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Select a valid expected date (YYYY-MM-DD)."),
});

export async function recordLenderApprovalAction(
  payload: z.input<typeof recordLenderApprovalSchema>,
): Promise<LenderActionResult> {
  const parsed = recordLenderApprovalSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your payment approval details." };
  }

  try {
    const ctx = await requireLender("approver", { mode: "throw" });
    const res = await recordLenderApprovalService(ctx.actor, parsed.data);
    revalidatePath("/lender");
    revalidatePath("/lender/applications");
    revalidatePath("/admin/accounts/funds");
    revalidatePath("/garage");
    revalidatePath("/account");
    return {
      ok: true,
      message: res.gateOpened
        ? "Payment approval recorded and repair job card opened."
        : "Payment approval recorded. Repair begins once Ask AutoParts Accounts confirms funds receipt.",
    };
  } catch (err) {
    return mapErr(err);
  }
}

export async function confirmSecondApprovalAction(
  attestationId: string,
): Promise<LenderActionResult> {
  if (!z.string().uuid().safeParse(attestationId).success) {
    return { ok: false, error: "Invalid attestation identifier." };
  }
  try {
    const ctx = await requireLender("approver", { mode: "throw" });
    const res = await confirmSecondApprovalService(ctx.actor, attestationId);
    revalidatePath("/lender");
    revalidatePath("/lender/applications");
    revalidatePath("/admin/accounts/funds");
    revalidatePath("/garage");
    return {
      ok: true,
      message: res.gateOpened
        ? "Second approval confirmed and repair job card opened."
        : "Second approval confirmed.",
    };
  } catch (err) {
    return mapErr(err);
  }
}

const manualRepaymentSchema = z.object({
  reference: z.string().trim().min(3, "Enter a valid application reference."),
  asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Select a valid date (YYYY-MM-DD)."),
  state: z.enum(["current", "catch_up", "arrears", "settled"]),
  installmentsPaid: z.coerce.number().int().min(0),
  installmentsMissed: z.coerce.number().int().min(0),
  note: z.string().max(500).optional(),
});

export async function submitManualRepaymentAction(
  payload: z.input<typeof manualRepaymentSchema>,
): Promise<LenderActionResult> {
  const parsed = manualRepaymentSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your repayment report details." };
  }

  try {
    const ctx = await requireLender(undefined, { mode: "throw" });
    await submitRepaymentReportService(ctx.actor, {
      ...parsed.data,
      source: "manual",
    });
    revalidatePath("/lender");
    revalidatePath("/lender/applications");
    revalidatePath("/lender/repayments/upload");
    revalidatePath("/account");
    return { ok: true, message: "Repayment status recorded." };
  } catch (err) {
    return mapErr(err);
  }
}

export async function uploadRepaymentCsvAction(csvText: string): Promise<LenderActionResult> {
  if (!csvText || csvText.trim().length < 5) {
    return { ok: false, error: "Provide CSV content to upload." };
  }

  try {
    const ctx = await requireLender(undefined, { mode: "throw" });
    const res = await uploadRepaymentCsvService(ctx.actor, csvText);
    revalidatePath("/lender");
    revalidatePath("/lender/applications");
    revalidatePath("/lender/repayments/upload");
    revalidatePath("/account");
    return {
      ok: true,
      imported: res.imported,
      rowErrors: res.errors,
      message:
        res.errors.length === 0
          ? `Imported ${res.imported} repayment report(s).`
          : `Imported ${res.imported} row(s) with ${res.errors.length} error(s).`,
    };
  } catch (err) {
    return mapErr(err);
  }
}

export async function lenderChangePasswordAction(formData: FormData): Promise<LenderActionResult> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your password details." };
  }

  try {
    const ctx = await requireLender(undefined, { mode: "throw" });
    await changePasswordService(ctx.actor, ctx.sessionId, {
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
    });
    revalidatePath("/lender/account");
    return { ok: true, message: "Password updated. Other active sessions were signed out." };
  } catch (err) {
    return mapErr(err);
  }
}

export async function lenderRevokeSessionAction(sessionId: string): Promise<LenderActionResult> {
  try {
    const ctx = await requireLender(undefined, { mode: "throw" });
    await revokeSessionService(ctx.actor, sessionId);
    revalidatePath("/lender/account");
    return { ok: true, message: "Session revoked." };
  } catch (err) {
    return mapErr(err);
  }
}

export async function lenderRevokeOtherSessionsAction(): Promise<LenderActionResult> {
  try {
    const ctx = await requireLender(undefined, { mode: "throw" });
    await revokeOtherSessionsService(ctx.actor, ctx.sessionId);
    revalidatePath("/lender/account");
    return { ok: true, message: "Signed out of all other devices." };
  } catch (err) {
    return mapErr(err);
  }
}
