import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";
import {
  BRAND_NAME,
  GARAGE_ADDRESS_PRIMARY,
  GARAGE_ADDRESS_SECONDARY,
  PLATFORM_NAME,
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
} from "@/lib/constants";

export interface EmailLayoutProps {
  preview: string;
  heading: string;
  children: ReactNode;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}

export function EmailLayout({
  preview,
  heading,
  children,
  ctaLabel,
  ctaUrl,
  footerNote,
}: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head />
      <div
        style={{
          display: "none",
          overflow: "hidden",
          lineHeight: "1px",
          opacity: 0,
          maxHeight: 0,
          maxWidth: 0,
        }}
      >
        {preview}
      </div>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.brandMark}>
              {BRAND_NAME} | {PLATFORM_NAME}
            </Text>
          </Section>

          <Section style={styles.content}>
            <Heading as="h1" style={styles.heading}>
              {heading}
            </Heading>
            {children}
            {ctaLabel && ctaUrl ? (
              <Section style={styles.ctaWrap}>
                <Button href={ctaUrl} style={styles.button}>
                  {ctaLabel}
                </Button>
              </Section>
            ) : null}
            {footerNote ? <Text style={styles.mutedText}>{footerNote}</Text> : null}
          </Section>

          <Hr style={styles.hr} />

          <Section style={styles.footer}>
            <Text style={styles.footerText}>{GARAGE_ADDRESS_PRIMARY}</Text>
            <Text style={styles.footerText}>{GARAGE_ADDRESS_SECONDARY}</Text>
            <Text style={styles.footerText}>
              Phone: {SUPPORT_PHONE} | Email: {SUPPORT_EMAIL}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: "#f8fafc",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    margin: "0",
    padding: "24px 12px",
    color: "#0f172a",
  },
  container: {
    maxWidth: "600px",
    margin: "0 auto",
    backgroundColor: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "8px",
    overflow: "hidden" as const,
  },
  header: {
    backgroundColor: "#0f172a",
    padding: "16px 24px",
  },
  brandMark: {
    margin: "0",
    fontSize: "14px",
    fontWeight: "700",
    color: "#f59e0b",
    letterSpacing: "0.02em",
  },
  content: {
    padding: "24px",
  },
  heading: {
    margin: "0 0 16px 0",
    fontSize: "20px",
    lineHeight: "28px",
    color: "#0f172a",
  },
  ctaWrap: {
    margin: "24px 0",
  },
  button: {
    backgroundColor: "#d97706",
    color: "#ffffff",
    fontSize: "14px",
    fontWeight: "600",
    textDecoration: "none",
    padding: "12px 20px",
    borderRadius: "6px",
    display: "inline-block",
  },
  mutedText: {
    fontSize: "13px",
    lineHeight: "20px",
    color: "#475569",
    margin: "16px 0 0 0",
  },
  hr: {
    borderColor: "#e2e8f0",
    margin: "0",
  },
  footer: {
    padding: "16px 24px",
    backgroundColor: "#f8fafc",
  },
  footerText: {
    margin: "2px 0",
    fontSize: "12px",
    lineHeight: "18px",
    color: "#475569",
  },
};
