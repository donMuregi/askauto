export type DomainErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "EMAIL_UNVERIFIED"
  | "PHONE_UNVERIFIED"
  | "MFA_REQUIRED"
  | "STEP_UP_REQUIRED"
  | "IP_NOT_ALLOWED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "ACTIVE_APPLICATION_EXISTS"
  | "INVALID_TRANSITION"
  | "GUARD_FAILED"
  | "RATE_LIMITED"
  | "ACCOUNT_LOCKED"
  | "CAPTCHA_FAILED"
  | "IMMUTABLE_RECORD"
  | "INTERNAL_ERROR";

export class DomainError extends Error {
  public readonly code: DomainErrorCode;
  public readonly httpStatus: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: DomainErrorCode,
    message: string,
    httpStatus = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError;
}
