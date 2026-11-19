import { z } from "zod";

const emptyToUndefined = (val: unknown) => (val === "" ? undefined : val);

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.string().url().default("http://localhost:3000"),
    INTEGRATIONS_MODE: z.enum(["fake", "real"]).default("fake"),

    DATABASE_URL: z
      .string()
      .min(1)
      .default("postgres://fnpl:fnpl@localhost:5432/fnpl"),
    DATABASE_URL_UNPOOLED: optionalString,

    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must be at least 32 characters")
      .default("local-dev-better-auth-secret-replace-in-production-0000"),
    BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),

    FIELD_ENCRYPTION_KEY: z
      .string()
      .min(32, "FIELD_ENCRYPTION_KEY must be a 32-byte base64 key")
      .default("MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY="),

    RESEND_API_KEY: optionalString,
    EMAIL_FROM: z
      .string()
      .default("Ask AutoParts <no-reply@mail.askautoparts.africa>"),
    EMAIL_REPLY_TO: z.string().email().default("mycar@askautoparts.africa"),
    RESEND_WEBHOOK_SECRET: optionalString,
    MAILPIT_SMTP_HOST: z.string().default("localhost"),
    MAILPIT_SMTP_PORT: z.coerce.number().int().positive().default(1025),

    AT_API_KEY: optionalString,
    AT_USERNAME: optionalString,
    AT_SENDER_ID: z.string().default("ASKAUTOPARTS"),

    WHATSAPP_TOKEN: optionalString,
    WHATSAPP_PHONE_ID: optionalString,
    WHATSAPP_VERIFY_TOKEN: optionalString,

    MPESA_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
    MPESA_CONSUMER_KEY: optionalString,
    MPESA_CONSUMER_SECRET: optionalString,
    MPESA_SHORTCODE: z.string().default("880100"),
    MPESA_PASSKEY: optionalString,
    MPESA_CALLBACK_SECRET: z.string().min(8).default("local-dev-mpesa-secret"),

    S3_ENDPOINT: optionalUrl,
    S3_REGION: z.string().default("auto"),
    S3_BUCKET: z.string().default("fnpl-private"),
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,

    INNGEST_EVENT_KEY: optionalString,
    INNGEST_SIGNING_KEY: optionalString,

    SENTRY_DSN: optionalUrl,

    TURNSTILE_SITE_KEY: optionalString,
    TURNSTILE_SECRET_KEY: optionalString,

    PDF_RENDERER_URL: optionalUrl,
    PDF_RENDERER_TOKEN: optionalString,
  })
  .superRefine((val, ctx) => {
    if (val.INTEGRATIONS_MODE === "real") {
      const requiredInReal: Array<keyof typeof val> = [
        "RESEND_API_KEY",
        "AT_API_KEY",
        "AT_USERNAME",
        "MPESA_CONSUMER_KEY",
        "MPESA_CONSUMER_SECRET",
        "MPESA_PASSKEY",
        "S3_BUCKET",
        "S3_ACCESS_KEY_ID",
        "S3_SECRET_ACCESS_KEY",
        "TURNSTILE_SITE_KEY",
        "TURNSTILE_SECRET_KEY",
      ];
      for (const key of requiredInReal) {
        if (!val[key]) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} is required when INTEGRATIONS_MODE=real`,
          });
        }
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  return envSchema.parse(source);
}

let cachedEnv: Env | null = null;

export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = parseEnv(process.env);
  }
  return cachedEnv;
}

export function resetEnvCache(): void {
  cachedEnv = null;
}
