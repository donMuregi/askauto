import { eq, sql } from "drizzle-orm";
import { signOutAction } from "@/app/(auth)/actions";
import { StaffShell } from "@/components/layouts/staff-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireStaff } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import {
  employerEligibleEmployees,
  employers,
  employerSchemes,
  lenders,
} from "@/server/db/schema";

export const dynamic = "force-dynamic";

export default async function AdminEmployersPage() {
  const ctx = await requireStaff(["ops_reviewer", "ops_approver", "admin"], {
    nextPath: "/admin/employers",
  });
  const db = getDb();

  const rows = await db
    .select({
      employerId: employers.id,
      employerName: employers.name,
      contactName: employers.contactName,
      contactEmail: employers.contactEmail,
      status: employers.status,
      schemeId: employerSchemes.id,
      agreementRef: employerSchemes.agreementRef,
      schemeStatus: employerSchemes.status,
      lenderName: lenders.name,
      employeeCount: sql<number>`(SELECT count(*)::int FROM employer_eligible_employees e WHERE e.scheme_id = ${employerSchemes.id} AND e.active = true)`,
    })
    .from(employers)
    .leftJoin(employerSchemes, eq(employerSchemes.employerId, employers.id))
    .leftJoin(lenders, eq(employerSchemes.lenderId, lenders.id));

  // Reference imported table cleanly
  void employerEligibleEmployees;

  return (
    <StaffShell
      userName={ctx.user.name}
      roles={ctx.staff?.roles ?? []}
      signOutAction={signOutAction}
    >
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Employers and schemes</h1>

        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.schemeId ?? r.employerId}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">{r.employerName}</CardTitle>
                  <Badge variant={r.schemeStatus === "active" ? "success" : "neutral"}>
                    {r.schemeStatus ?? r.status}
                  </Badge>
                </div>
                <CardDescription>
                  Contact: {r.contactName} ({r.contactEmail})
                </CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1">
                <p>
                  Scheme agreement: <span className="font-mono text-foreground">{r.agreementRef ?? "None"}</span> | Partner bank:{" "}
                  <span className="font-medium text-foreground">{r.lenderName ?? "Unassigned"}</span>
                </p>
                <p>Active eligible employees: {r.employeeCount ?? 0}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </StaffShell>
  );
}
