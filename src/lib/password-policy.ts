import { createHash } from "node:crypto";
import zxcvbn from "zxcvbn";

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

// High-frequency breached/common passwords (augmented by zxcvbn dictionary + HIBP range API)
const COMMON_PASSWORDS = new Set([
  "1234567890",
  "12345678901",
  "password123",
  "password1234",
  "qwerty1234",
  "qwertyuiop",
  "iloveyou123",
  "admin12345",
  "welcome123",
  "letmein123",
  "kenya12345",
  "nairobi123",
  "askautoparts",
  "0000000000",
  "1111111111",
  "abcdefghij",
]);

export interface PasswordValidationResult {
  valid: boolean;
  reason?: string;
}

export function validatePasswordStructure(password: string): PasswordValidationResult {
  // Never trim or truncate passwords
  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      valid: false,
      reason: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`,
    };
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return {
      valid: false,
      reason: `Password must be at most ${PASSWORD_MAX_LENGTH} characters long.`,
    };
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return {
      valid: false,
      reason: "This password is too common. Choose a less predictable passphrase.",
    };
  }

  const result = zxcvbn(password);
  const matchedCommonDictionary = result.sequence.some(
    (token) =>
      token.pattern === "dictionary" &&
      "rank" in token &&
      typeof token.rank === "number" &&
      token.rank <= 10000 &&
      token.token.length >= password.length - 1,
  );

  if (matchedCommonDictionary) {
    return {
      valid: false,
      reason: "This password appears on a common password list. Choose a stronger passphrase.",
    };
  }

  return { valid: true };
}

export async function isPasswordBreachedHibp(
  password: string,
  options?: { fetchFn?: typeof fetch; skipNetwork?: boolean },
): Promise<boolean> {
  if (options?.skipNetwork) {
    return false;
  }

  const sha1 = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  const fetchImpl = options?.fetchFn ?? fetch;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const response = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      // Fail open if HIBP is unreachable
      return false;
    }

    const body = await response.text();
    const lines = body.split("\n");
    for (const line of lines) {
      const [hashSuffix, countStr] = line.trim().split(":");
      if (hashSuffix === suffix && Number.parseInt(countStr ?? "0", 10) > 0) {
        return true;
      }
    }
    return false;
  } catch {
    // Fail open if unreachable
    return false;
  }
}

export async function validatePasswordPolicy(
  password: string,
  options?: { skipHibp?: boolean; fetchFn?: typeof fetch },
): Promise<PasswordValidationResult> {
  const structural = validatePasswordStructure(password);
  if (!structural.valid) {
    return structural;
  }

  const breached = await isPasswordBreachedHibp(password, {
    skipNetwork: options?.skipHibp,
    fetchFn: options?.fetchFn,
  });

  if (breached) {
    return {
      valid: false,
      reason: "This password appeared in a known data breach. Choose a different password.",
    };
  }

  return { valid: true };
}

export function getPasswordStrength(password: string): {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
} {
  if (!password) {
    return { score: 0, label: "Enter a password" };
  }
  const result = zxcvbn(password);
  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong"] as const;
  return {
    score: result.score,
    label: labels[result.score],
  };
}
