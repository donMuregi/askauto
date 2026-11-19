import { Bell, FileText, FolderKanban, LayoutDashboard, Lock, Shield, User } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { BrandMark } from "./brand-mark";
import { NavLink } from "./nav-link";
import { sidebarLinkActive, sidebarLinkBase, sidebarLinkInactive } from "./nav-styles";
import { appHeaderClass, signOutButtonClass, UserChip } from "./user-chip";

interface CustomerShellProps {
  children: ReactNode;
  userName: string;
  unreadCount?: number;
  unverified?: boolean;
  signOutAction?: () => Promise<void>;
}

const navItems = [
  { href: "/account", label: "Dashboard", icon: LayoutDashboard },
  { href: "/account/applications", label: "Applications", icon: FolderKanban },
  { href: "/account/documents", label: "Documents", icon: FileText },
  { href: "/account/profile", label: "Profile", icon: User },
  { href: "/account/security", label: "Security", icon: Shield },
  { href: "/account/notifications", label: "Notifications", icon: Bell },
  { href: "/account/privacy", label: "Privacy", icon: Lock },
];

export function CustomerShell({
  children,
  userName,
  unreadCount = 0,
  unverified = false,
  signOutAction,
}: CustomerShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground pb-20 md:pb-0">
      <header className={appHeaderClass}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <BrandMark href="/account" size="sm" />
          <div className="flex items-center gap-3">
            <Link
              href="/account/notifications"
              aria-label={`Notifications (${unreadCount} unread)`}
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-foreground"
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
              {unreadCount > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-surface bg-foreground px-1 text-[10px] font-semibold text-background">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Link>
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

      {unverified ? (
        <div className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6">
          <Alert variant="warning" className="flex flex-wrap items-center justify-between gap-2">
            <span>Verify your email or phone number before starting an application.</span>
            <Link href="/verify" className="font-semibold underline underline-offset-4">
              Complete verification
            </Link>
          </Alert>
        </div>
      ) : null}

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-4 py-8 sm:px-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <nav aria-label="Account navigation" className="sticky top-24 space-y-1">
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              My account
            </p>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.href}
                  href={item.href}
                  className={sidebarLinkBase}
                  activeClassName={sidebarLinkActive}
                  inactiveClassName={sidebarLinkInactive}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <nav
        aria-label="Mobile account navigation"
        className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-border bg-surface/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden"
      >
        {navItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors"
              activeClassName="bg-surface-muted text-foreground"
              inactiveClassName="text-muted-foreground hover:text-foreground"
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
