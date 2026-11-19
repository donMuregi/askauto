import Link from "next/link";
import { signOutAction } from "@/app/(auth)/actions";
import { BrandMark } from "@/components/layouts/brand-mark";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKenyanDateTime } from "@/lib/format";
import { requireStaff } from "@/server/auth/guards";
import { listGarageJobsService } from "@/server/domain/garage/service";

export const dynamic = "force-dynamic";

function jobStatusBadge(
  jobStatus: string,
  handoverReady: boolean,
): { label: string; variant: "neutral" | "brand" | "accent" | "success" } {
  if (jobStatus === "completed") return { label: "Completed", variant: "success" };
  if (handoverReady) return { label: "Awaiting customer sign-off", variant: "brand" };
  if (jobStatus === "in_progress") return { label: "In progress", variant: "accent" };
  return { label: "New / Opened", variant: "brand" };
}

export default async function GarageDashboardPage() {
  const ctx = await requireStaff(["garage", "admin", "ops_reviewer", "ops_approver"], {
    nextPath: "/garage",
  });
  const data = await listGarageJobsService(ctx.actor);

  const activeJobs = data.jobs.filter((j) => j.jobStatus !== "completed");
  const completedJobs = data.jobs.filter((j) => j.jobStatus === "completed");

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
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

      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Garage workshop dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Jobs appear here automatically once both lender payment approval and Ask AutoParts funds receipt are confirmed.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-1">
              <CardDescription>New / Opened</CardDescription>
              <CardTitle className="text-2xl">{data.counts.opened}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Awaiting vehicle check-in
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardDescription>Repairs in progress</CardDescription>
              <CardTitle className="text-2xl">{data.counts.inProgress}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Active bays & scope work
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardDescription>Ready for handover</CardDescription>
              <CardTitle className="text-2xl">{data.counts.awaitingHandover}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              QA passed; awaiting collection sign-off
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardDescription>Completed & handed over</CardDescription>
              <CardTitle className="text-2xl">{data.counts.completed}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Closed job cards
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Active garage jobs ({activeJobs.length})</CardTitle>
            <CardDescription>
              Select a job card to check in the vehicle, update repair lines, upload photos, and record handover.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activeJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active jobs right now. New job cards open automatically after payment confirmation.
              </p>
            ) : (
              <div className="space-y-3">
                {activeJobs.map((job) => {
                  const badge = jobStatusBadge(job.jobStatus, job.handoverReady);
                  return (
                    <Link
                      key={job.jobId}
                      href={`/garage/jobs/${job.jobId}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-4 py-3 text-sm transition-colors hover:border-brand/60 hover:bg-surface-muted/50"
                    >
                      <div className="space-y-0.5">
                        <p className="font-semibold text-foreground">
                          Job #{job.jobNo} — {job.regNo ?? "No plate"}{" "}
                          {job.makeModel ? `(${job.makeModel})` : ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Ref: {job.reference} | Customer: {job.customerName}
                          {job.customerPhone ? ` (${job.customerPhone})` : ""} |{" "}
                          {job.garageBranch ?? job.garageName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Opened {formatKenyanDateTime(job.openedAt)} | Scope lines:{" "}
                          <span className="font-medium text-foreground">
                            {job.completedLines} / {job.totalLines} completed
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                        <span className="text-xs font-medium text-accent">Open job card</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Completed jobs ({completedJobs.length})</CardTitle>
            <CardDescription>Vehicles handed over with signed completion certificates.</CardDescription>
          </CardHeader>
          <CardContent>
            {completedJobs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No completed jobs yet.</p>
            ) : (
              <div className="space-y-2">
                {completedJobs.map((job) => (
                  <Link
                    key={job.jobId}
                    href={`/garage/jobs/${job.jobId}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-4 py-3 text-sm hover:bg-surface-muted/50"
                  >
                    <div>
                      <p className="font-semibold text-foreground">
                        Job #{job.jobNo} — {job.regNo ?? "No plate"}{" "}
                        {job.makeModel ? `(${job.makeModel})` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Ref: {job.reference} | Customer: {job.customerName} | Handed over{" "}
                        {job.handedOverAt
                          ? formatKenyanDateTime(job.handedOverAt)
                          : job.completedAt
                            ? formatKenyanDateTime(job.completedAt)
                            : "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="success">Completed</Badge>
                      <span className="text-xs font-medium text-accent">View record</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
