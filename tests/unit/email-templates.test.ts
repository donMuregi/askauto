import { describe, expect, it } from "vitest";
import {
  renderEmailTemplate,
  SAMPLE_EMAIL_PAYLOADS,
  type EmailTemplateKey,
} from "../../emails/render";

const EMOJI_REGEX = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u;

describe("email templates", () => {
  const keys = Object.keys(SAMPLE_EMAIL_PAYLOADS) as EmailTemplateKey[];

  it.each(keys)("renders HTML and plain-text for %s with no emojis", async (key) => {
    const rendered = await renderEmailTemplate(key, SAMPLE_EMAIL_PAYLOADS[key]);
    expect(rendered.subject.length).toBeGreaterThan(5);
    expect(rendered.html).toContain("Ask AutoParts");
    expect(rendered.html).toContain("Mirema Drive");
    expect(rendered.text).toContain("Ask AutoParts");
    expect(rendered.text.length).toBeGreaterThan(30);
    expect(EMOJI_REGEX.test(rendered.subject)).toBe(false);
    expect(EMOJI_REGEX.test(rendered.html)).toBe(false);
    expect(EMOJI_REGEX.test(rendered.text)).toBe(false);
  });
});
