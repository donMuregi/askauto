import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

describe("env parsing", () => {
  it("parses local fake defaults without external secrets", () => {
    const env = parseEnv({
      NODE_ENV: "development",
      INTEGRATIONS_MODE: "fake",
      APP_URL: "http://localhost:3000",
      DATABASE_URL: "postgres://fnpl:fnpl@localhost:5432/fnpl",
      BETTER_AUTH_SECRET: "a".repeat(32),
      FIELD_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    });

    expect(env.INTEGRATIONS_MODE).toBe("fake");
    expect(env.MPESA_SHORTCODE).toBe("880100");
  });

  it("requires external integration secrets when INTEGRATIONS_MODE=real", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "production",
        INTEGRATIONS_MODE: "real",
        APP_URL: "https://fnpl.askautoparts.africa",
        DATABASE_URL: "postgres://user:pass@host:5432/fnpl",
        BETTER_AUTH_SECRET: "a".repeat(32),
        FIELD_ENCRYPTION_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      }),
    ).toThrow(/RESEND_API_KEY/);
  });
});
