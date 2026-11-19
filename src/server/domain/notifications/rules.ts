import { addMinutes } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { NAIROBI_TIMEZONE } from "@/lib/format";
import { RETRY_BACKOFF_MINUTES } from "@/lib/constants";

export type NotificationChannel = "email" | "sms" | "whatsapp" | "in_app";
export type NotificationCategory = "transactional" | "reminders";

export interface EventRule {
  channels: NotificationChannel[];
  category: NotificationCategory;
  critical: boolean;
  bypassQuietHours: boolean;
  inAppTitle?: string;
  inAppBody?: (payload: Record<string, unknown>) => string;
  inAppLink?: (payload: Record<string, unknown>) => string;
}

export const EVENT_RULES: Record<string, EventRule> = {
  "auth.verify_email": {
    channels: ["email"],
    category: "transactional",
    critical: true,
    bypassQuietHours: true,
  },
  "auth.otp": {
    channels: ["sms"],
    category: "transactional",
    critical: true,
    bypassQuietHours: true,
  },
  "auth.welcome": {
    channels: ["email", "in_app"],
    category: "transactional",
    critical: false,
    bypassQuietHours: true,
    inAppTitle: "Account verified",
    inAppBody: () => "Your email and phone are verified. Start your application.",
    inAppLink: () => "/apply",
  },
  "auth.password_reset": {
    channels: ["email"],
    category: "transactional",
    critical: true,
    bypassQuietHours: true,
  },
  "auth.password_changed": {
    channels: ["email"],
    category: "transactional",
    critical: true,
    bypassQuietHours: true,
  },
  "auth.duplicate_signup": {
    channels: ["email"],
    category: "transactional",
    critical: false,
    bypassQuietHours: true,
  },
  "auth.email_change_notice": {
    channels: ["email"],
    category: "transactional",
    critical: true,
    bypassQuietHours: true,
  },
  "auth.phone_change_notice": {
    channels: ["sms"],
    category: "transactional",
    critical: true,
    bypassQuietHours: true,
  },
  "auth.lockout": {
    channels: ["email"],
    category: "transactional",
    critical: true,
    bypassQuietHours: true,
  },
  "auth.invite": {
    channels: ["email"],
    category: "transactional",
    critical: true,
    bypassQuietHours: true,
  },
  "auth.mfa_reset": {
    channels: ["email"],
    category: "transactional",
    critical: true,
    bypassQuietHours: true,
  },
  "auth.new_device": {
    channels: ["email"],
    category: "transactional",
    critical: false,
    bypassQuietHours: true,
  },
  "application.started": {
    channels: ["in_app"],
    category: "transactional",
    critical: false,
    bypassQuietHours: true,
    inAppTitle: "Application draft saved",
    inAppBody: () => "Continue your application when ready.",
    inAppLink: () => "/apply",
  },
  "application.draft_reminder": {
    channels: ["email", "sms"],
    category: "reminders",
    critical: false,
    bypassQuietHours: false,
  },
  "fee.paid": {
    channels: ["email", "sms", "in_app"],
    category: "transactional",
    critical: true,
    bypassQuietHours: true,
    inAppTitle: "Inspection fee received",
    inAppBody: (p) => `Fee payment confirmed for ${String(p.reference ?? "your application")}.`,
    inAppLink: (p) => (p.reference ? `/account/applications/${String(p.reference)}` : "/account"),
  },
  "booking.confirmed": {
    channels: ["email", "sms", "in_app"],
    category: "transactional",
    critical: true,
    bypassQuietHours: true,
    inAppTitle: "Inspection booked",
    inAppBody: (p) => `Inspection booked for ${String(p.reference ?? "your application")}.`,
    inAppLink: (p) => (p.reference ? `/account/applications/${String(p.reference)}` : "/account"),
  },
  "booking.reminder": {
    channels: ["sms", "email"],
    category: "reminders",
    critical: false,
    bypassQuietHours: false,
  },
  "report.ready": {
    channels: ["email", "sms", "in_app"],
    category: "transactional",
    critical: true,
    bypassQuietHours: false,
    inAppTitle: "Diagnostic report ready",
    inAppBody: (p) => `Your report is ready (${String(p.reference ?? "")}).`,
    inAppLink: (p) => (p.reference ? `/account/applications/${String(p.reference)}` : "/account"),
  },
  "scope.sent": {
    channels: ["email", "sms", "in_app"],
    category: "transactional",
    critical: true,
    bypassQuietHours: false,
    inAppTitle: "Repair scope ready for approval",
    inAppBody: (p) => `Review and sign your priced repair scope (${String(p.reference ?? "")}).`,
    inAppLink: (p) => (p.reference ? `/account/applications/${String(p.reference)}` : "/account"),
  },
  "offer.made": {
    channels: ["email", "sms", "in_app"],
    category: "transactional",
    critical: true,
    bypassQuietHours: false,
    inAppTitle: "Financing offer ready",
    inAppBody: (p) => `Review and respond to your offer (${String(p.reference ?? "")}).`,
    inAppLink: (p) => (p.reference ? `/account/applications/${String(p.reference)}` : "/account"),
  },
  "reminder.repayment": {
    channels: ["sms", "email"],
    category: "reminders",
    critical: false,
    bypassQuietHours: false,
  },
};

export function isInQuietHoursEat(date: Date = new Date()): boolean {
  const hourStr = formatInTimeZone(date, NAIROBI_TIMEZONE, "H");
  const hour = Number.parseInt(hourStr, 10);
  return hour >= 21 || hour < 7;
}

export function nextQuietHoursEndUtc(date: Date = new Date()): Date {
  const eatDateStr = formatInTimeZone(date, NAIROBI_TIMEZONE, "yyyy-MM-dd");
  const hour = Number.parseInt(formatInTimeZone(date, NAIROBI_TIMEZONE, "H"), 10);

  if (hour < 7) {
    return fromZonedTime(`${eatDateStr} 07:00:00`, NAIROBI_TIMEZONE);
  }
  const tomorrow = addMinutes(date, 24 * 60);
  const tomorrowEatStr = formatInTimeZone(tomorrow, NAIROBI_TIMEZONE, "yyyy-MM-dd");
  return fromZonedTime(`${tomorrowEatStr} 07:00:00`, NAIROBI_TIMEZONE);
}

export function computeNextRetryAt(attempts: number, now: Date = new Date()): Date | null {
  if (attempts >= RETRY_BACKOFF_MINUTES.length) {
    return null;
  }
  const delayMinutes = RETRY_BACKOFF_MINUTES[attempts];
  return addMinutes(now, delayMinutes);
}

export function formatSmsMessage(type: string, payload: Record<string, unknown>): string {
  switch (type) {
    case "auth.otp": {
      const code = String(payload.code ?? "");
      const minutes = Number(payload.expiresMinutes ?? 5);
      // Never include links in OTP messages
      return `Your Ask AutoParts code is ${code}. It expires in ${minutes} minutes. Do not share it.`;
    }
    case "auth.phone_change_notice":
      return "Ask AutoParts: Your account phone number was changed. If this was not you, contact +254 700 031 732.";
    case "fee.paid":
    case "booking.confirmed":
      return `Ask AutoParts: KES 1,500 fee received (${String(payload.mpesaReceipt ?? "")}). Ref ${String(payload.reference ?? "")}.`;
    case "report.ready":
      return `Ask AutoParts: Your diagnostic report is ready (${String(payload.reference ?? "")}). Sign in to view.`;
    case "scope.sent":
      return `Ask AutoParts: Your priced repair scope is ready (${String(payload.reference ?? "")}). Sign in to review.`;
    case "offer.made":
      return `Ask AutoParts: Your financing offer is ready (${String(payload.reference ?? "")}). Sign in to respond.`;
    case "reminder.repayment":
      return `Ask AutoParts reminder: Payment of ${String(payload.amountFormatted ?? "")} due ${String(payload.dueDate ?? "")}. Pay your financing partner directly.`;
    default:
      return `Ask AutoParts update (${String(payload.reference ?? "account")}). Sign in to your account for details.`;
  }
}
