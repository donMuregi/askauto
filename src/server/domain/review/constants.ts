export const DOC_TYPE_LABELS: Record<string, string> = {
  national_id_front: "National ID (front)",
  national_id_back: "National ID (back)",
  selfie: "Clear selfie photo",
  psv_licence: "PSV driving licence",
  good_conduct: "Certificate of good conduct",
  logbook: "Vehicle logbook",
  insurance: "Motor insurance certificate",
  app_profile: "Ride-hailing driver profile screenshot",
  earnings_statement: "Ride-hailing earnings statement",
  mpesa_statement: "6-month M-Pesa statement (PDF)",
  payroll_consent: "Signed payroll deduction consent",
  employer_confirmation: "Employer eligibility confirmation (ops upload)",
};

export const REJECTION_REASON_CODES = [
  { code: "blurry_or_unreadable", label: "Blurry or unreadable image" },
  { code: "expired_document", label: "Expired document" },
  { code: "name_mismatch", label: "Name does not match national ID" },
  { code: "wrong_document", label: "Wrong document uploaded" },
  { code: "incomplete_statement", label: "Incomplete period (less than 6 months)" },
  { code: "password_incorrect", label: "M-Pesa PDF password missing or incorrect" },
  { code: "other", label: "Other (see note)" },
] as const;
