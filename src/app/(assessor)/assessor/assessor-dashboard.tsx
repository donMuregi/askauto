"use client";

import { ChevronRight, ClipboardCheck, Clock, FileCheck2, Search, Wrench } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatKes } from "@/lib/format";
import type { AssessmentState } from "@/server/domain/inspections/service";

export interface SerializedAssessorItem {
  applicationId: string;
  reference: string | null;
  applicationStatus: string;
  assessmentState: AssessmentState;
  regNo: string;
  makeModel: string;
  vehicleYear: number | null;
  customerName: string;
  faultDescription: string | null;
  slotStartFormatted: string;
  garageLabel: string;
  findingsCount: number;
  scopeStatus: string | null;
  scopeTotalKes: number | null;
  returnNotes: string | null;
  inspectionUpdatedFormatted: string | null;
}

interface AssessorDashboardClientProps {
  items: SerializedAssessorItem[];
  counts: {
    newCount: number;
    inProgressCount: number;
    awaitingScopeCount: number;
    priorAssessedCount: number;
  };
}

type FilterTab = "all" | "new" | "in_progress" | "assessed";

function stateBadge(state: AssessmentState): {
  label: string;
  variant: "brand" | "accent" | "success" | "destructive" | "neutral";
  cta: string;
} {
  switch (state) {
    case "new":
      return { label: "New application", variant: "brand", cta: "Start inspection" };
    case "draft":
      return { label: "Draft in progress", variant: "accent", cta: "Resume inspection" };
    case "returned":
      return { label: "Returned for edits", variant: "destructive", cta: "Review notes" };
    case "submitted":
      return { label: "Report submitted", variant: "accent", cta: "Build repair scope" };
    case "scope_sent":
      return { label: "Scope sent to customer", variant: "neutral", cta: "View / revise scope" };
    case "approved":
      return { label: "Assessed & approved", variant: "success", cta: "View assessment" };
  }
}

export function AssessorDashboardClient({ items, counts }: AssessorDashboardClientProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [search, setSearch] = useState("");

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (activeTab === "new" && item.assessmentState !== "new") return false;
      if (
        activeTab === "in_progress" &&
        item.assessmentState !== "draft" &&
        item.assessmentState !== "returned" &&
        item.assessmentState !== "submitted"
      ) {
        return false;
      }
      if (
        activeTab === "assessed" &&
        item.assessmentState !== "submitted" &&
        item.assessmentState !== "scope_sent" &&
        item.assessmentState !== "approved"
      ) {
        return false;
      }

      if (!q) return true;
      return (
        item.regNo.toLowerCase().includes(q) ||
        item.makeModel.toLowerCase().includes(q) ||
        item.customerName.toLowerCase().includes(q) ||
        (item.reference?.toLowerCase().includes(q) ?? false) ||
        (item.faultDescription?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [items, activeTab, search]);

  const tabs: Array<{ id: FilterTab; label: string; count: number }> = [
    { id: "all", label: "All vehicles", count: items.length },
    { id: "new", label: "New", count: counts.newCount },
    {
      id: "in_progress",
      label: "In progress / Needs scope",
      count: counts.inProgressCount + counts.awaitingScopeCount,
    },
    { id: "assessed", label: "Previously assessed", count: counts.priorAssessedCount },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>New applications</CardDescription>
              <Clock className="h-4 w-4 text-brand" aria-hidden="true" />
            </div>
            <CardTitle className="text-2xl">{counts.newCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Booked vehicles not yet inspected
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>In progress</CardDescription>
              <Wrench className="h-4 w-4 text-accent" aria-hidden="true" />
            </div>
            <CardTitle className="text-2xl">{counts.inProgressCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Saved drafts or returned reports
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Awaiting repair scope</CardDescription>
              <ClipboardCheck className="h-4 w-4 text-accent" aria-hidden="true" />
            </div>
            <CardTitle className="text-2xl">{counts.awaitingScopeCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Report submitted, scope pending
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardDescription>Previously assessed</CardDescription>
              <FileCheck2 className="h-4 w-4 text-success" aria-hidden="true" />
            </div>
            <CardTitle className="text-2xl">{counts.priorAssessedCount}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Submitted reports and sent scopes
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter inspections">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? "border-brand bg-brand text-brand-foreground"
                  : "border-border bg-surface text-foreground hover:bg-surface-muted"
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs ${
                  activeTab === tab.id
                    ? "bg-white/20 text-white"
                    : "bg-surface-muted text-muted-foreground"
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plate, ref, customer..."
            aria-label="Search vehicles"
            className="pl-9"
          />
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No vehicles match this filter.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const meta = stateBadge(item.assessmentState);
            return (
              <Link
                key={item.applicationId}
                href={`/assessor/inspections/${item.applicationId}`}
                className="block rounded-lg border border-border bg-surface p-5 shadow-xs transition-colors hover:border-brand hover:bg-surface-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold text-foreground">
                        {item.regNo} — {item.makeModel}
                        {item.vehicleYear ? ` (${item.vehicleYear})` : ""}
                      </span>
                      <Badge variant={meta.variant}>{meta.label}</Badge>
                      {item.reference ? (
                        <span className="rounded bg-surface-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                          {item.reference}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Customer: <span className="font-medium text-foreground">{item.customerName}</span>{" "}
                      | Slot: {item.slotStartFormatted} | {item.garageLabel}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Reported fault: {item.faultDescription ?? "None recorded"}
                    </p>
                    {item.returnNotes ? (
                      <p className="text-xs font-medium text-destructive">
                        Return notes: {item.returnNotes}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-row items-center justify-between gap-4 sm:flex-col sm:items-end">
                    <div className="text-left sm:text-right text-xs text-muted-foreground space-y-0.5">
                      <p>Findings: {item.findingsCount}</p>
                      {item.scopeTotalKes !== null ? (
                        <p className="font-semibold text-foreground">
                          Scope: {formatKes(item.scopeTotalKes)}
                        </p>
                      ) : (
                        <p>Scope: Not built</p>
                      )}
                      {item.inspectionUpdatedFormatted ? (
                        <p>Updated: {item.inspectionUpdatedFormatted}</p>
                      ) : null}
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-brand">
                      {meta.cta}
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
