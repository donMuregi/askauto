import Link from "next/link";
import type { ReactNode } from "react";
import { GARAGE_ADDRESS_PRIMARY, SUPPORT_EMAIL, SUPPORT_PHONE } from "@/lib/constants";
import { BrandMark } from "./brand-mark";

interface MarketingShellProps {
  children: ReactNode;
  isSignedIn?: boolean;
  portalHref?: string;
  portalLabel?: string;
}

const primaryCta =
  "inline-flex min-h-10 items-center rounded-lg bg-foreground px-4 text-sm font-semibold text-background transition-colors hover:bg-foreground/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";
const navLink =
  "rounded-md text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";

export function MarketingShell({
  children,
  isSignedIn = false,
  portalHref = "/account",
  portalLabel = "My Account",
}: MarketingShellProps) {
  const isCustomerPortal = portalHref === "/account";

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="mx-auto flex h-[72px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <BrandMark href="/" />
          <nav aria-label="Main navigation" className="hidden items-center gap-8 md:flex">
            <Link href="/fnpl" className={navLink}>
              How it works
            </Link>
            <Link href="/for-employers" className={navLink}>
              For employers
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            {isSignedIn ? (
              <>
                <Link href={portalHref} className={`hidden sm:inline ${navLink}`}>
                  {portalLabel}
                </Link>
                <Link href={isCustomerPortal ? "/apply" : portalHref} className={primaryCta}>
                  {isCustomerPortal ? "Continue your application" : `Open ${portalLabel}`}
                </Link>
              </>
            ) : (
              <>
                <Link href="/sign-in" className={navLink}>
                  Sign in
                </Link>
                <Link href="/sign-up?next=/apply" className={primaryCta}>
                  Create account to apply
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="space-y-4">
            <BrandMark href="/" size="sm" />
            <p className="max-w-xs text-sm text-muted-foreground">
              Vehicle repair financing by Ask AutoParts.
            </p>
          </div>
          <div className="space-y-3 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Visit or contact us
            </p>
            <p className="font-medium text-foreground">{GARAGE_ADDRESS_PRIMARY}</p>
            <p className="text-muted-foreground">
              {SUPPORT_PHONE}
              <br />
              {SUPPORT_EMAIL}
            </p>
          </div>
          <div className="space-y-3 text-sm">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Legal
            </p>
            <div className="flex flex-col gap-2">
              <Link href="/legal/terms" className="text-muted-foreground hover:text-foreground">
                Terms of Use
              </Link>
              <Link href="/legal/privacy" className="text-muted-foreground hover:text-foreground">
                Privacy Notice
              </Link>
              <Link href="/legal/consent-notice" className="text-muted-foreground hover:text-foreground">
                Consent Notice
              </Link>
            </div>
          </div>
        </div>
        <div className="border-t border-border">
          <p className="mx-auto max-w-6xl px-4 py-5 text-xs text-muted-foreground sm:px-6">
            © {new Date().getFullYear()} Ask AutoParts. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
