import { describe, expect, it } from "vitest";
import { normalizeIdentifier, normalizeKenyanPhone } from "@/lib/phone";

describe("Kenyan phone normalisation", () => {
  it("normalises 07, 01, 254, and +254 mobile formats to E.164", () => {
    expect(normalizeKenyanPhone("0712 345 678")).toBe("+254712345678");
    expect(normalizeKenyanPhone("0112 345 678")).toBe("+254112345678");
    expect(normalizeKenyanPhone("254712345678")).toBe("+254712345678");
    expect(normalizeKenyanPhone("+254 712-345-678")).toBe("+254712345678");
  });

  it("rejects non-Kenyan numbers and Kenyan landlines", () => {
    expect(normalizeKenyanPhone("+14155552671")).toBeNull();
    expect(normalizeKenyanPhone("+447700900077")).toBeNull();
    expect(normalizeKenyanPhone("0202221111")).toBeNull();
    expect(normalizeKenyanPhone("12345")).toBeNull();
  });

  it("resolves email vs phone identifiers", () => {
    expect(normalizeIdentifier("Driver@Example.COM")).toEqual({
      kind: "email",
      value: "driver@example.com",
    });
    expect(normalizeIdentifier("0712345678")).toEqual({
      kind: "phone",
      value: "+254712345678",
    });
    expect(normalizeIdentifier("invalid")).toBeNull();
  });
});
