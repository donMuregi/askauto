import { formatInTimeZone } from "date-fns-tz";

export const NAIROBI_TIMEZONE = "Africa/Nairobi";

export function formatKes(amountKes: number): string {
  const whole = Math.round(amountKes);
  const formatted = new Intl.NumberFormat("en-KE", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(whole);
  return `KES ${formatted}`;
}

export function formatKenyanDate(date: Date | string | number): string {
  return formatInTimeZone(new Date(date), NAIROBI_TIMEZONE, "d MMMM yyyy");
}

export function formatKenyanDateTime(date: Date | string | number): string {
  return `${formatInTimeZone(new Date(date), NAIROBI_TIMEZONE, "d MMMM yyyy, HH:mm")} EAT`;
}

export function formatKenyanTime(date: Date | string | number): string {
  return `${formatInTimeZone(new Date(date), NAIROBI_TIMEZONE, "HH:mm")} EAT`;
}
