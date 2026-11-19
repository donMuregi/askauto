import { beforeEach, describe, expect, it } from "vitest";
import {
  clearDevOutboxEntries,
  listDevOutboxEntries,
} from "@/server/integrations/notifications/dev-store";
import { FakeEmailProvider } from "@/server/integrations/notifications/email";
import { FakeSmsProvider } from "@/server/integrations/notifications/sms";

describe("fake notification providers", () => {
  beforeEach(() => {
    clearDevOutboxEntries();
  });

  it("captures emails and SMS messages in the dev outbox store", async () => {
    const email = new FakeEmailProvider();
    const sms = new FakeSmsProvider();

    const emailRes = await email.send({
      to: "driver@example.com",
      subject: "Verify your Ask AutoParts email",
      html: "<p>Verify</p>",
      text: "Verify",
    });

    const smsRes = await sms.send({
      to: "+254712345678",
      message: "Your Ask AutoParts code is 123456. It expires in 5 minutes. Do not share it.",
      purpose: "auth.otp",
    });

    expect(emailRes.status).toBe("sent");
    expect(smsRes.status).toBe("sent");

    const entries = listDevOutboxEntries();
    expect(entries).toHaveLength(2);
    expect(entries[0]?.channel).toBe("sms");
    expect(entries[1]?.channel).toBe("email");
  });
});
