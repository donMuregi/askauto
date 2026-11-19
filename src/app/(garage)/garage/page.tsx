import { desc, eq } from "drizzle-orm";
import { signOutAction } from "@/app/(auth)/actions";
import { BrandMark } from "@/components/layouts/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaff } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { applications, jobCards } from "@/server/db/schema";

export const dynamic = "force-dynamic";

export default async function GarageDashboardPage() {
  const ctx = await requireStaff(["garage", "admin"], { nextPath: "/garage" });

  // R4/R10: only applications in REPAIR_IN_PROGRESS (both payment attestations present) have open Job Cards
  const jobs = await getDb()
    .select({
      jobCard: jobCards,
      reference: applications.reference,
      appStatus: applications.status,
    })
    .from(jobCards)
    .innerJoin(applications, eq(jobCards.applicationId, applications.id))
    .orderBy(desc(jobCards.openedAt))
    .limit(50);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <BrandMark href="/garage" />
            <Badge variant="brand">Garage</Badge>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">{ctx.user.name}</span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="font-medium text-muted-foreground hover:text-foreground cursor-pointer"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Active garage jobs</h1>
        {jobs.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              No active jobs yet. Jobs open once both lender payment approval and receipt of funds
              are confirmed.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {jobs.map(({ jobCard, reference }) => (
              <Card key={jobCard.id}>
                <CardHeader>
                  <CardTitle className="text-base">
                    Job #{jobCard.jobNo} ({reference})
                  </CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
