import { describe, expect, it } from "vitest";
import {
  getPasswordStrength,
  validatePasswordPolicy,
  validatePasswordStructure,
} from "@/lib/password-policy";

describe("password policy", () => {
  it("enforces 10 to 128 characters without trimming or composition rules", () => {
    expect(validatePasswordStructure("short1234").valid).toBe(false);
    expect(validatePasswordStructure("a".repeat(129)).valid).toBe(false);
    // Spaces preserved (never trimmed)
    expect(validatePasswordStructure("  correct horse battery  ").valid).toBe(true);
    // Lowercase passphrase accepted (no composition rules)
    expect(validatePasswordStructure("mombasa-road-sunset-42").valid).toBe(true);
  });

  it("rejects common passwords", () => {
    expect(validatePasswordStructure("password123").valid).toBe(false);
    expect(validatePasswordStructure("1234567890").valid).toBe(false);
  });

  it("checks HIBP range API via k-anonymity and rejects matched hashes", async () => {
    // SHA-1 of "k-anon-breached-passphrase" is computed dynamically; mock response matching its suffix
    const { createHash } = await import("node:crypto");
    const candidate = "k-anon-breached-passphrase-99";
    const sha1 = createHash("sha1").update(candidate, "utf8").digest("hex").toUpperCase();
    const prefix = sha1.slice(0, 5);
    const suffix = sha1.slice(5);

    const mockFetch: typeof fetch = async (url) => {
      expect(String(url)).toBe(`https://api.pwnedpasswords.com/range/${prefix}`);
      return new Response(`${suffix}:42\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:0\r\n`, {
        status: 200,
      });
    };

    const result = await validatePasswordPolicy(candidate, { fetchFn: mockFetch });
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("data breach");
  });

  it("fails open if HIBP is unreachable", async () => {
    const failingFetch: typeof fetch = async () => {
      throw new Error("network down");
    };
    const result = await validatePasswordPolicy("k-anon-strong-passphrase-88", {
      fetchFn: failingFetch,
    });
    expect(result.valid).toBe(true);
  });

  it("computes zxcvbn strength score", () => {
    expect(getPasswordStrength("correct horse battery staple 99").score).toBeGreaterThanOrEqual(3);
  });
});
