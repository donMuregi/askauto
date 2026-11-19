"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { isDomainError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { requireCustomer } from "@/server/auth/guards";
import {
  cancelApplicationService,
  createBookingAndInitiateFeeService,
  processStkCallbackService,
  startApplicationService,
  submitDetailsService,
} from "@/server/domain/applications/service";

export interface ApplyActionResult {
  ok: boolean;
  error?: string;
  message?: string;
  redirectTo?: string;
  checkoutRequestId?: string;
  feeKes?: number;
  reference?: string | null;
}

function handleError(err: unknown): ApplyActionResult {
  if (isDomainError(err)) {
    return { ok: false, error: err.message };
  }
  logger.error({ err }, "unexpected application action error");
  return { ok: false, error: "Could not complete this step. Try again." };
}

const startApplicationSchema = z.object({
  product: z.enum(["RIDE_HAILING", "SALARIED"]),
  platform: z.enum(["uber", "bolt", "little", "other"]).optional(),
  platformOther: z.string().trim().max(80).optional(),
  employerId: z.string().uuid().optional(),
  employeeNumber: z.string().trim().max(60).optional(),
});

export async function startApplication(formData: FormData): Promise<ApplyActionResult> {
  const rawProduct = formData.get("product");
  const rawPlatform = formData.get("platform");
  const rawEmployerId = formData.get("employerId");

  const parsed = startApplicationSchema.safeParse({
    product: rawProduct,
    platform: typeof rawPlatform === "string" && rawPlatform ? rawPlatform : undefined,
    platformOther:
      typeof formData.get("platformOther") === "string"
        ? String(formData.get("platformOther"))
        : undefined,
    employerId: typeof rawEmployerId === "string" && rawEmployerId ? rawEmployerId : undefined,
    employeeNumber:
      typeof formData.get("employeeNumber") === "string"
        ? String(formData.get("employeeNumber"))
        : undefined,
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your selection." };
  }

  try {
    const ctx = await requireCustomer({ verified: true, mode: "throw" });
    const app = await startApplicationService(ctx.actor, parsed.data);
    revalidatePath("/account");
    if (app.reference && app.status !== "DRAFT") {
      return { ok: true, redirectTo: `/account/applications/${encodeURIComponent(app.reference)}` };
    }
    return { ok: true, redirectTo: `/apply/${app.id}/details` };
  } catch (err) {
    return handleError(err);
  }
}

const submitDetailsSchema = z.object({
  applicationId: z.string().uuid(),
  nationalId: z
    .string()
    .trim()
    .min(5, "Enter a valid national ID number.")
    .max(20, "Enter a valid national ID number."),
  regNo: z.string().trim().min(5, "Enter your vehicle registration plate.").max(20),
  makeModel: z.string().trim().min(2, "Enter your vehicle make and model.").max(100),
  year: z.coerce.number().int().min(1980).max(2027).optional(),
  faultDescription: z
    .string()
    .trim()
    .min(5, "Describe the fault or repair needed.")
    .max(1000),
  consentAccepted: z.literal(true, {
    error: "Accept the Consent Notice to continue.",
  }),
});

export async function submitDetails(formData: FormData): Promise<ApplyActionResult> {
  const yearRaw = formData.get("year");

  const parsed = submitDetailsSchema.safeParse({
    applicationId: formData.get("applicationId"),
    nationalId: formData.get("nationalId"),
    regNo: formData.get("regNo"),
    makeModel: formData.get("makeModel"),
    year: yearRaw && String(yearRaw).trim() !== "" ? yearRaw : undefined,
    faultDescription: formData.get("faultDescription"),
    consentAccepted:
      formData.get("consentAccepted") === "on" || formData.get("consentAccepted") === "true",
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your details." };
  }

  try {
    const ctx = await requireCustomer({ verified: true, mode: "throw" });
    const app = await submitDetailsService(ctx.actor, parsed.data);
    revalidatePath("/account");
    return { ok: true, redirectTo: `/apply/${app.id}/book` };
  } catch (err) {
    return handleError(err);
  }
}

const createBookingSchema = z.object({
  applicationId: z.string().uuid(),
  garageId: z.string().uuid("Select a garage."),
  slotValue: z.string().min(10, "Select an inspection slot."),
  depositKes: z.coerce.number().int().min(0).default(0),
  mpesaPhone: z.string().trim().min(9, "Enter a valid M-Pesa phone number."),
});

export async function createBookingAndPay(formData: FormData): Promise<ApplyActionResult> {
  const parsed = createBookingSchema.safeParse({
    applicationId: formData.get("applicationId"),
    garageId: formData.get("garageId"),
    slotValue: formData.get("slotValue"),
    depositKes: formData.get("depositKes") || 0,
    mpesaPhone: formData.get("mpesaPhone"),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your booking details." };
  }

  const [slotStartIso, slotEndIso] = parsed.data.slotValue.split("|");
  if (!slotStartIso || !slotEndIso) {
    return { ok: false, error: "Select a valid inspection slot." };
  }

  try {
    const ctx = await requireCustomer({ verified: true, mode: "throw" });
    const res = await createBookingAndInitiateFeeService(ctx.actor, {
      applicationId: parsed.data.applicationId,
      garageId: parsed.data.garageId,
      slotStartIso,
      slotEndIso,
      depositKes: parsed.data.depositKes,
      mpesaPhone: parsed.data.mpesaPhone,
    });
    return {
      ok: true,
      message: res.customerMessage,
      checkoutRequestId: res.checkoutRequestId,
      feeKes: res.feeKes,
      reference: res.reference,
    };
  } catch (err) {
    return handleError(err);
  }
}

export async function simulateFakeMpesaCallback(
  checkoutRequestId: string,
  outcome: "success" | "cancel" | "timeout" | "insufficient",
): Promise<ApplyActionResult> {
  const env = getEnv();
  if (env.INTEGRATIONS_MODE !== "fake" || env.NODE_ENV === "production") {
    return { ok: false, error: "Payment simulation is disabled in live mode." };
  }

  try {
    const ctx = await requireCustomer({ verified: true, mode: "throw" });
    const codeMap = {
      success: { code: "0", desc: "The service request is processed successfully." },
      cancel: { code: "1032", desc: "Request cancelled by user" },
      timeout: { code: "1037", desc: "DS timeout user cannot be reached" },
      insufficient: { code: "1", desc: "The balance is insufficient for the transaction" },
    }[outcome];

    const res = await processStkCallbackService({
      checkoutRequestId,
      resultCode: codeMap.code,
      resultDesc: codeMap.desc,
      mpesaReceipt:
        outcome === "success" ? `MP${Date.now().toString().slice(-8)}` : undefined,
      rawCallback: { simulated: true, outcome, code: codeMap.code },
      customerUserId: ctx.user.id,
    });

    if (res.status === "paid" && "reference" in res && res.reference) {
      revalidatePath("/account");
      return {
        ok: true,
        message: res.message,
        redirectTo: `/account/applications/${encodeURIComponent(res.reference)}`,
      };
    }

    return { ok: false, error: res.message };
  } catch (err) {
    return handleError(err);
  }
}

export async function cancelApplication(formData: FormData): Promise<ApplyActionResult> {
  const applicationId = String(formData.get("applicationId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!applicationId || reason.length < 3) {
    return { ok: false, error: "Provide a brief reason for cancelling your application." };
  }

  try {
    const ctx = await requireCustomer({ verified: true, mode: "throw" });
    await cancelApplicationService(ctx.actor, applicationId, reason);
    revalidatePath("/account");
    return { ok: true, redirectTo: "/account" };
  } catch (err) {
    return handleError(err);
  }
}
