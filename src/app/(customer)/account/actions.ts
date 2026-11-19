"use server";

import { revalidatePath } from "next/cache";
import { isDomainError } from "@/lib/errors";
import { requireCustomer } from "@/server/auth/guards";
import {
  changePasswordSchema,
  confirmPhoneChangeSchema,
  requestEmailChangeSchema,
  requestPhoneChangeSchema,
  updateProfileSchema,
} from "@/server/auth/schemas";
import {
  changePasswordService,
  confirmPhoneChangeService,
  requestAccountDeletionService,
  requestDataExportService,
  requestEmailChangeService,
  requestPhoneChangeService,
  revokeOtherSessionsService,
  revokeSessionService,
  updateProfileService,
} from "@/server/auth/service";
import {
  markNotificationRead,
  setReminderPreferences,
} from "@/server/domain/notifications/in-app";

export interface AccountActionResult {
  ok: boolean;
  message?: string;
  error?: string;
}

function handleErr(err: unknown): AccountActionResult {
  if (isDomainError(err)) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: "Could not complete your request. Try again." };
}

export async function updateProfile(formData: FormData): Promise<AccountActionResult> {
  const parsed = updateProfileSchema.safeParse({
    fullName: formData.get("fullName"),
    locale: formData.get("locale") ?? "en",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your profile details." };
  }
  try {
    const ctx = await requireCustomer({ verified: false, mode: "throw" });
    await updateProfileService(ctx.actor, parsed.data);
    revalidatePath("/account/profile");
    return { ok: true, message: "Profile updated." };
  } catch (err) {
    return handleErr(err);
  }
}

export async function changeEmail(formData: FormData): Promise<AccountActionResult> {
  const parsed = requestEmailChangeSchema.safeParse({
    newEmail: formData.get("newEmail"),
    currentPassword: formData.get("currentPassword"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your email details." };
  }
  try {
    const ctx = await requireCustomer({ verified: false, mode: "throw" });
    await requestEmailChangeService(ctx.actor, parsed.data);
    return {
      ok: true,
      message: "Verification link sent to your new email address. Confirm it to complete the change.",
    };
  } catch (err) {
    return handleErr(err);
  }
}

export async function changePhone(formData: FormData): Promise<AccountActionResult> {
  const parsed = requestPhoneChangeSchema.safeParse({
    newPhone: formData.get("newPhone"),
    currentPassword: formData.get("currentPassword"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your phone details." };
  }
  try {
    const ctx = await requireCustomer({ verified: false, mode: "throw" });
    await requestPhoneChangeService(ctx.actor, parsed.data);
    return { ok: true, message: "Enter the 6-digit SMS code sent to your new phone number." };
  } catch (err) {
    return handleErr(err);
  }
}

export async function confirmPhoneChange(formData: FormData): Promise<AccountActionResult> {
  const parsed = confirmPhoneChangeSchema.safeParse({
    code: formData.get("code"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Enter the 6-digit code." };
  }
  try {
    const ctx = await requireCustomer({ verified: false, mode: "throw" });
    await confirmPhoneChangeService(ctx.actor, parsed.data.code);
    revalidatePath("/account/profile");
    return { ok: true, message: "Phone number updated." };
  } catch (err) {
    return handleErr(err);
  }
}

export async function changePassword(formData: FormData): Promise<AccountActionResult> {
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your password details." };
  }
  try {
    const ctx = await requireCustomer({ verified: false, mode: "throw" });
    await changePasswordService(ctx.actor, ctx.sessionId, {
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
    });
    revalidatePath("/account/security");
    return { ok: true, message: "Password updated. Other active sessions were signed out." };
  } catch (err) {
    return handleErr(err);
  }
}

export async function revokeSession(sessionId: string): Promise<AccountActionResult> {
  try {
    const ctx = await requireCustomer({ verified: false, mode: "throw" });
    await revokeSessionService(ctx.actor, sessionId);
    revalidatePath("/account/security");
    return { ok: true, message: "Session revoked." };
  } catch (err) {
    return handleErr(err);
  }
}

export async function revokeOtherSessions(): Promise<AccountActionResult> {
  try {
    const ctx = await requireCustomer({ verified: false, mode: "throw" });
    await revokeOtherSessionsService(ctx.actor, ctx.sessionId);
    revalidatePath("/account/security");
    return { ok: true, message: "Signed out of all other devices." };
  } catch (err) {
    return handleErr(err);
  }
}

export async function markNotificationReadAction(notificationId: string): Promise<AccountActionResult> {
  try {
    const ctx = await requireCustomer({ verified: false, mode: "throw" });
    await markNotificationRead(ctx.actor, notificationId);
    revalidatePath("/account/notifications");
    return { ok: true };
  } catch (err) {
    return handleErr(err);
  }
}

export async function setNotificationPreferences(formData: FormData): Promise<AccountActionResult> {
  try {
    const ctx = await requireCustomer({ verified: false, mode: "throw" });
    await setReminderPreferences(ctx.actor, {
      email: formData.get("email") === "on",
      sms: formData.get("sms") === "on",
      whatsapp: formData.get("whatsapp") === "on",
    });
    revalidatePath("/account/notifications");
    return { ok: true, message: "Reminder preferences saved." };
  } catch (err) {
    return handleErr(err);
  }
}

export async function requestDataExport(): Promise<AccountActionResult> {
  try {
    const ctx = await requireCustomer({ verified: false, mode: "throw" });
    await requestDataExportService(ctx.actor);
    revalidatePath("/account/privacy");
    return { ok: true, message: "Data export requested. We will fulfil it within 30 days." };
  } catch (err) {
    return handleErr(err);
  }
}

export async function requestAccountDeletion(formData: FormData): Promise<AccountActionResult> {
  const reason = typeof formData.get("reason") === "string" ? String(formData.get("reason")) : undefined;
  try {
    const ctx = await requireCustomer({ verified: false, mode: "throw" });
    await requestAccountDeletionService(ctx.actor, reason);
    revalidatePath("/account/privacy");
    return { ok: true, message: "Account deletion request submitted for review." };
  } catch (err) {
    return handleErr(err);
  }
}
