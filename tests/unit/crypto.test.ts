import { describe, expect, it } from "vitest";
import { decryptField, encryptField, hmacHash, maskNationalId, sha256Hex } from "@/lib/crypto";

describe("crypto helpers", () => {
  const testKey = Buffer.alloc(32, 7).toString("base64");

  it("encrypts and decrypts national ID with AES-256-GCM", () => {
    const encrypted = encryptField("34567890", testKey);
    expect(encrypted.toString("utf8")).not.toContain("34567890");
    expect(decryptField(encrypted, testKey)).toBe("34567890");
  });

  it("produces deterministic HMAC hashes independent of case and surrounding spaces", () => {
    expect(hmacHash("  34567890 ", testKey)).toBe(hmacHash("34567890", testKey));
    expect(hmacHash("A123", testKey)).toBe(hmacHash("a123", testKey));
  });

  it("masks national IDs showing only the last 3 digits", () => {
    expect(maskNationalId("34567890")).toBe("*****890");
  });

  it("computes SHA-256 hex digest", () => {
    expect(sha256Hex("hello")).toHaveLength(64);
  });
});
