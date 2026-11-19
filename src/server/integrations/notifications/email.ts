import nodemailer from "nodemailer";
import { Resend } from "resend";
import { uuidv7 } from "uuidv7";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordDevOutboxEntry } from "./dev-store";
import type { DeliverySendResult, EmailMessage, EmailProvider } from "./types";

export class ResendEmailProvider implements EmailProvider {
  readonly channel = "email" as const;

  async send(input: EmailMessage): Promise<DeliverySendResult> {
    const env = getEnv();
    const resend = new Resend(env.RESEND_API_KEY);
    try {
      const result = await resend.emails.send({
        from: env.EMAIL_FROM,
        replyTo: input.replyTo ?? env.EMAIL_REPLY_TO,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        tags: input.tags,
      });

      if (result.error) {
        const isHard =
          result.error.name === "validation_error" ||
          result.error.message.toLowerCase().includes("invalid");
        return {
          providerMessageId: "",
          status: "failed",
          hardFailure: isHard,
          error: result.error.message,
        };
      }

      return {
        providerMessageId: result.data?.id ?? uuidv7(),
        status: "sent",
      };
    } catch (err) {
      return {
        providerMessageId: "",
        status: "failed",
        error: err instanceof Error ? err.message : "Email send failed",
      };
    }
  }
}

export class FakeEmailProvider implements EmailProvider {
  readonly channel = "email" as const;

  async send(input: EmailMessage): Promise<DeliverySendResult> {
    const env = getEnv();
    const entry = recordDevOutboxEntry({
      channel: "email",
      to: input.to,
      subject: input.subject,
      bodyText: input.text,
      bodyHtml: input.html,
    });

    // Forward to local Mailpit when running outside unit tests and Mailpit is reachable
    if (env.NODE_ENV !== "test") {
      try {
        const transporter = nodemailer.createTransport({
          host: env.MAILPIT_SMTP_HOST,
          port: env.MAILPIT_SMTP_PORT,
          secure: false,
          connectionTimeout: 1000,
          greetingTimeout: 1000,
        });
        await transporter.sendMail({
          from: env.EMAIL_FROM,
          replyTo: input.replyTo ?? env.EMAIL_REPLY_TO,
          to: input.to,
          subject: input.subject,
          html: input.html,
          text: input.text,
        });
      } catch {
        logger.debug({ outboxId: entry.id }, "mailpit unavailable; stored email in dev outbox");
      }
    }

    return {
      providerMessageId: `fake-email-${entry.id}`,
      status: "sent",
    };
  }
}

export function getEmailProvider(): EmailProvider {
  return getEnv().INTEGRATIONS_MODE === "real"
    ? new ResendEmailProvider()
    : new FakeEmailProvider();
}
