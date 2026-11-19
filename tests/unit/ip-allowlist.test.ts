import { describe, expect, it } from "vitest";
import { isIpInAllowlist } from "@/lib/ip";

describe("lender IP allowlist", () => {
  it("allows any IP when allowlist is empty or null", () => {
    expect(isIpInAllowlist("197.232.10.5", null)).toBe(true);
    expect(isIpInAllowlist("197.232.10.5", [])).toBe(true);
  });

  it("matches IPv4 CIDR ranges and IPv4-mapped IPv6 addresses", () => {
    const allowlist = ["197.232.10.0/24", "41.80.12.34/32"];
    expect(isIpInAllowlist("197.232.10.99", allowlist)).toBe(true);
    expect(isIpInAllowlist("::ffff:41.80.12.34", allowlist)).toBe(true);
    expect(isIpInAllowlist("197.232.11.1", allowlist)).toBe(false);
    expect(isIpInAllowlist(null, allowlist)).toBe(false);
  });
});
