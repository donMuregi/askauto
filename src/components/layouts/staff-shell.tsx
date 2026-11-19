import Link from "next/link";
import type { ReactNode } from "react";
import type { StaffRole } from "@/server/db/rls";
import { BrandMark } from "./brand-mark";

interface StaffShellProps {
  children: ReactNode;
  userName: string;
  roles: StaffRole[];
  signOutAction?: () => Promise<void>;
}

const staffNav: Array<{ href: string; label: string; roles: StaffRole[] }> = [
  { href: "/admin", label: "Dashboard", roles: ["admin", "ops_reviewer", "ops_approver", "accounts", "garage", "assessor"] },
  { href: "/admin/review", label: "Review Queue", roles: ["admin", "ops_reviewer", "ops_approver"] },
  { href: "/admin/applications", label: "Applications", roles: ["admin", "ops_reviewer", "ops_approver"] },
  { href: "/admin/accounts/fees", label: "Fee Payments", roles: ["admin", "accounts"] },
  { href: "/admin/accounts/funds", label: "Funds Receipt", roles: ["admin", "accounts"] },
  { href: "/admin/employers", label: "Employers", roles: ["admin", "ops_reviewer", "ops_approver"] },
  { href: "/admin/lenders", label: "Lenders", roles: ["admin"] },
  { href: "/admin/users", label: "Staff Users", roles: ["admin"] },
  { href: "/admin/catalogue", label: "Catalogue", roles: ["admin"] },
  { href: "/admin/garages", label: "Garages", roles: ["admin"] },
  { href: "/admin/settings", label: "Settings", roles: ["admin"] },
  { href: "/admin/notifications", label: "Notifications", roles: ["admin", "ops_reviewer", "ops_approver"] },
  { href: "/admin/audit", label: "Audit Log", roles: ["admin"] },
];

export function StaffShell({ children, userName, roles, signOutAction }: StaffShellProps) {
  const visibleNav = staffNav.filter((item) => item.roles.some((r) => roles.includes(r)));

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark href="/admin" />
            <span className="rounded bg-surface-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Staff
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
          <nav aria-label="Staff navigation" className="space-y-1">
            {visibleNav.map((item) => (
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
