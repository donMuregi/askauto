import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "./brand-mark";

interface LenderShellProps {
  children: ReactNode;
  lenderName: string;
  userName: string;
  signOutAction?: () => Promise<void>;
}

const lenderNav = [
  { href: "/lender", label: "Dashboard" },
  { href: "/lender/inbox", label: "Inbox" },
  { href: "/lender/applications", label: "Applications" },
  { href: "/lender/repayments/upload", label: "Repayment Reports" },
  { href: "/lender/account", label: "Account" },
];

export function LenderShell({ children, lenderName, userName, signOutAction }: LenderShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark href="/lender" />
            <span className="rounded bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
              {lenderName}
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">{userName}</span>
            {signOutAction ? (
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Sign out
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6">
        <aside className="hidden w-52 shrink-0 md:block">
          <nav aria-label="Lender navigation" className="space-y-1">
            {lenderNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-surface hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
