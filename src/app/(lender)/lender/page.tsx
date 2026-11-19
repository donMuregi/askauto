import { desc, eq } from "drizzle-orm";
import { signOutAction } from "@/app/(auth)/actions";
import { LenderShell } from "@/components/layouts/lender-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKenyanDateTime } from "@/lib/format";
import { requireLender } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { applications, lenderSubmissions } from "@/server/db/schema";

export const dynamic = "force-dynamic";

export default async function LenderDashboardPage() {
  const ctx = await requireLender(undefined, { nextPath: "/lender" });
  const lenderId = ctx.lender!.id;

  const submissions = await getDb()
    .select({
      submission: lenderSubmissions,
      reference: applications.reference,
      status: applications.status,
    })
    .from(lenderSubmissions)
    .innerJoin(applications, eq(lenderSubmissions.applicationId, applications.id))
    .where(eq(lenderSubmissions.lenderId, lenderId))
    .orderBy(desc(lenderSubmissions.submittedAt))
    .limit(50);

  return (
    <LenderShell
      lenderName={ctx.lender!.name}
      userName={ctx.user.name}
      signOutAction={signOutAction}
    >
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Lender inbox</h1>
        {submissions.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              No submitted application packages yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {submissions.map(({ submission, reference, status }) => (
              <Card key={submission.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-base">{reference}</CardTitle>
                    <Badge variant="accent">{status}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Package v{submission.packageVersion} | Submitted{" "}
                  {formatKenyanDateTime(submission.submittedAt)}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </LenderShell>
  );
}
