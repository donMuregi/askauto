import { signOutAction } from "@/app/(auth)/actions";
import { LenderShell } from "@/components/layouts/lender-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKenyanDateTime } from "@/lib/format";
import { requireLender } from "@/server/auth/guards";
import { listActiveSessionsService } from "@/server/auth/service";
import { LenderAccountForms } from "./lender-account-forms";

export const dynamic = "force-dynamic";

export default async function LenderAccountPage() {
  const ctx = await requireLender(undefined, { nextPath: "/lender/account" });
  const sessions = await listActiveSessionsService(ctx.actor, ctx.sessionId);

  return (
    <LenderShell
      lenderName={ctx.lender!.name}
      userName={`${ctx.user.name} (${ctx.lender!.role})`}
      signOutAction={signOutAction}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Account & security</h1>
          <p className="text-sm text-muted-foreground">
            Manage your lender portal credentials and active sessions.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
            <CardDescription>Organisation membership and role.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Name</p>
              <p className="font-medium">{ctx.user.name}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-medium">{ctx.user.email}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Organisation & role</p>
              <p className="font-medium capitalize">
                {ctx.lender!.name} ({ctx.lender!.role})
              </p>
            </div>
          </CardContent>
        </Card>

        <LenderAccountForms
          sessions={sessions.map((s) => ({
            id: s.id,
            ipAddress: s.ipAddress,
            userAgent: s.userAgent,
            lastActiveFormatted: formatKenyanDateTime(s.lastActiveAt),
            isCurrent: s.isCurrent,
          }))}
        />
      </div>
    </LenderShell>
  );
}
