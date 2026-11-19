import { describe, expect, it } from "vitest";
import { safeNext } from "@/server/auth/safe-next";

describe("safeNext()", () => {
  it("allows relative same-origin paths", () => {
    expect(safeNext("/apply")).toBe("/apply");
    expect(safeNext("/account/applications/AAP%2FFNPL%2F2026%2F0001?tab=docs")).toBe(
      "/account/applications/AAP%2FFNPL%2F2026%2F0001?tab=docs",
    );
  });

  it("rejects protocol-relative and absolute URLs", () => {
    expect(safeNext("//evil.example/steal", "/apply")).toBe("/apply");
    expect(safeNext("https://evil.example/steal", "/apply")).toBe("/apply");
    expect(safeNext("javascript:alert(1)", "/apply")).toBe("/apply");
    expect(safeNext("/\\evil.example", "/apply")).toBe("/apply");
    expect(safeNext("", "/account")).toBe("/account");
    expect(safeNext(undefined, "/account")).toBe("/account");
  });
});
