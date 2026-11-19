import { parsePhoneNumberFromString } from "libphonenumber-js";

export function normalizeKenyanPhone(input: string): string | null {
  const cleaned = input.trim().replace(/[\s()-]+/g, "");
  if (!cleaned) return null;

  let candidate = cleaned;
  if (/^254[17]\d{8}$/.test(cleaned)) {
    candidate = `+${cleaned}`;
  }

  const parsed = parsePhoneNumberFromString(candidate, "KE");
  if (!parsed || !parsed.isValid() || parsed.country !== "KE") {
    return null;
  }

  const e164 = parsed.format("E.164");
  // Launch constraint: Kenyan mobile numbers only (+2547XXXXXXXX or +2541XXXXXXXX)
  if (!/^\+254[17]\d{8}$/.test(e164)) {
    return null;
  }

  return e164;
}

export function isEmailIdentifier(identifier: string): boolean {
  return identifier.trim().includes("@");
}

export function normalizeIdentifier(identifier: string): {
  kind: "email" | "phone";
  value: string;
} | null {
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  if (isEmailIdentifier(trimmed)) {
    const email = trimmed.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { kind: "email", value: email } : null;
  }

  const phone = normalizeKenyanPhone(trimmed);
  return phone ? { kind: "phone", value: phone } : null;
}
