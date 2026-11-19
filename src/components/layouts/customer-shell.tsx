import { Bell, FileText, FolderKanban, LayoutDashboard, Lock, Shield, User } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { BrandMark } from "./brand-mark";

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
    <div className="flex min-h-screen flex-col bg-background text-foreground pb-16 md:pb-0">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <BrandMark href="/account" />
          <div className="flex items-center gap-4">
            <Link
              href="/account/notifications"
              aria-label={`Notifications (${unreadCount} unread)`}
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-md border border-border text-foreground hover:bg-surface-muted"
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
              {unreadCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-semibold text-brand-foreground">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Link>
            <span className="hidden text-sm text-muted-foreground sm:inline">{userName}</span>
            {signOutAction ? (
              <form action={signOutAction}>
                <button
                  type="submit"
                  className="text-sm font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Sign out
                </button>
              </form>
            ) : null}
          </div>
        </div>
      </header>

      {unverified ? (
        <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
          <Alert variant="warning" className="flex flex-wrap items-center justify-between gap-2">
            <span>Verify your email or phone number before starting an application.</span>
            <Link href="/verify" className="font-semibold underline">
              Complete verification
            </Link>
          </Alert>
        </div>
      ) : null}

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-6 sm:px-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <nav aria-label="Account navigation" className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-surface hover:text-foreground"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <nav
        aria-label="Mobile account navigation"
        className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-border bg-surface py-2 md:hidden"
      >
        {navItems.slice(0, 5).map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-0.5 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
