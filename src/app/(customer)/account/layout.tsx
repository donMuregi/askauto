import type { ReactNode } from "react";
import { CustomerShell } from "@/components/layouts/customer-shell";
import { signOutAction } from "@/app/(auth)/actions";
import { requireCustomer } from "@/server/auth/guards";
import { getUnreadNotificationCount } from "@/server/domain/notifications/in-app";

export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: ReactNode }) {
  const ctx = await requireCustomer({ verified: false, nextPath: "/account" });
  const unreadCount = await getUnreadNotificationCount(ctx.user.id);
  const unverified = !ctx.user.emailVerified && !ctx.user.phoneNumberVerified;

  return (
    <CustomerShell
      userName={ctx.user.name}
      unreadCount={unreadCount}
      unverified={unverified}
      signOutAction={signOutAction}
    >
      {children}
    </CustomerShell>
  );
}
