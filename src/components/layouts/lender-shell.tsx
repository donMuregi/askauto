import type { ReactNode } from "react";
import { BrandMark } from "./brand-mark";
import { NavLink } from "./nav-link";
import { sidebarLinkActive, sidebarLinkBase, sidebarLinkInactive } from "./nav-styles";
import { appHeaderClass, signOutButtonClass, UserChip } from "./user-chip";

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
      <header className={appHeaderClass}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark href="/lender" size="sm" />
            <span className="rounded-md bg-foreground px-2 py-0.5 text-[11px] font-semibold tracking-tight text-background">
              {lenderName}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <UserChip name={userName} />
            {signOutAction ? (
              <form action={signOutAction}>
                <button type="submit" className={signOutButtonClass}>
                  Sign out
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-8 px-4 py-8 sm:px-6">
        <aside className="hidden w-52 shrink-0 md:block">
          <nav aria-label="Lender navigation" className="sticky top-24 space-y-1">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Lender portal
            </p>
            {lenderNav.map((item) => (
              <NavLink
                key={item.href}
                href={item.href}
                className={sidebarLinkBase}
                activeClassName={sidebarLinkActive}
                inactiveClassName={sidebarLinkInactive}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
