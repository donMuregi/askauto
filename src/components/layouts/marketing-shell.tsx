import Link from "next/link";
import type { ReactNode } from "react";
import { GARAGE_ADDRESS_PRIMARY, SUPPORT_EMAIL, SUPPORT_PHONE } from "@/lib/constants";
import { BrandMark } from "./brand-mark";

interface MarketingShellProps {
  children: ReactNode;
  isSignedIn?: boolean;
}

export function MarketingShell({ children, isSignedIn = false }: MarketingShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <BrandMark href="/" />
          <nav aria-label="Main navigation" className="hidden items-center gap-6 text-sm md:flex">
            <Link href="/fnpl" className="text-muted-foreground hover:text-foreground">
              How it works
            </Link>
            <Link href="/for-employers" className="text-muted-foreground hover:text-foreground">
              For employers
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            {isSignedIn ? (
              <>
                <Link
                  href="/account"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  My Account
                </Link>
                <Link
                  href="/apply"
                  className="inline-flex min-h-10 items-center rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand-hover"
                >
                  Continue your application
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  Sign in
                </Link>
                <Link
                  href="/sign-up?next=/apply"
                  className="inline-flex min-h-10 items-center rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand-hover"
                >
                  Create account to apply
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border bg-surface py-8 text-xs text-muted-foreground">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="font-medium text-foreground">{GARAGE_ADDRESS_PRIMARY}</p>
            <p>
              {SUPPORT_PHONE} | {SUPPORT_EMAIL}
            </p>
          </div>
          <div className="flex flex-wrap gap-4">
            <Link href="/legal/terms" className="hover:text-foreground">
              Terms of Use
            </Link>
            <Link href="/legal/privacy" className="hover:text-foreground">
              Privacy Notice
            </Link>
            <Link href="/legal/consent-notice" className="hover:text-foreground">
              Consent Notice
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
