import { formatKenyanDateTime } from "@/lib/format";
import { requireCustomer } from "@/server/auth/guards";
import { listActiveSessionsService } from "@/server/auth/service";
import { SecurityForms } from "./security-forms";

export const dynamic = "force-dynamic";

export default async function AccountSecurityPage() {
  const ctx = await requireCustomer({ verified: false, nextPath: "/account/security" });
  const sessions = await listActiveSessionsService(ctx.actor, ctx.sessionId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
      <SecurityForms
        sessions={sessions.map((s) => ({
          id: s.id,
          ipAddress: s.ipAddress,
          userAgent: s.userAgent,
          lastActiveFormatted: formatKenyanDateTime(s.lastActiveAt),
          isCurrent: s.isCurrent,
        }))}
      />
    </div>
  );
}
