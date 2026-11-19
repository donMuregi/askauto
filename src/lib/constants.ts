export const BRAND_NAME = "Ask AutoParts";
export const PLATFORM_NAME = "Fix Now, Pay Later";
export const PARTNER_MARK = "MICROMID";

export const SUPPORT_PHONE = "+254 700 031 732";
export const SUPPORT_EMAIL = "mycar@askautoparts.africa";
export const GARAGE_ADDRESS_PRIMARY = "Ask Autoparts Garage, Mirema Drive, Off Thika Road";
export const GARAGE_ADDRESS_SECONDARY = "Tagline Center, Road A, Godown 26";

export const DEFAULT_INSPECTION_FEE_KES = 1500;
export const DEFAULT_SCOPE_VARIANCE_PCT = 10;
export const DEFAULT_VAT_RATE_PCT = 16;
export const DEFAULT_OTP_TTL_SECONDS = 300;
export const DEFAULT_RESET_TOKEN_TTL_MINUTES = 30;
export const DEFAULT_REVIEW_SLA_HOURS = 8;
export const DEFAULT_NON_ELIGIBLE_FALLBACK = "CASH_ROUTE";

export const TERMS_VERSION = "2026-11-19-v1";
export const PRIVACY_VERSION = "2026-11-19-v1";
export const CONSENT_NOTICE_VERSION = "2026-11-19-v1";

export const TERMINAL_APPLICATION_STATUSES = [
  "SETTLED",
  "DECLINED",
  "CANCELLED",
  "EXPIRED",
  "CASH_ROUTE",
] as const;

export const RETRY_BACKOFF_MINUTES = [1, 5, 30, 120, 360] as const;
