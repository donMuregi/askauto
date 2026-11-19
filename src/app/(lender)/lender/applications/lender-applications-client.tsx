"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export interface LenderAppRow {
  submissionId: string;
  applicationId: string;
  reference: string | null;
  appStatus: string;
  substatus: string | null;
  productCode: "RIDE_HAILING" | "SALARIED";
  customerName: string;
  regNo: string | null;
  makeModel: string | null;
  packageVersion: number;
  submittedAtFormatted: string;
  financedAmountKes: number | null;
  hasLenderApproval: boolean;
  repaymentState: string | null;
}

const STATUS_OPTIONS = [
  { value: "ALL", label: "All statuses" },
  { value: "WITH_LENDER", label: "Awaiting decision" },
  { value: "OFFER_MADE", label: "Offer sent" },
  { value: "APPROVED", label: "Approved (payment gate)" },
  { value: "REPAIR_IN_PROGRESS", label: "Repair in progress" },
  { value: "REPAYING", label: "Repaying" },
  { value: "SETTLED", label: "Settled" },
  { value: "DECLINED", label: "Declined" },
];

function badgeVariant(
  status: string,
): "neutral" | "brand" | "accent" | "success" | "destructive" {
  switch (status) {
    case "WITH_LENDER":
      return "accent";
    case "OFFER_MADE":
    case "APPROVED":
      return "brand";
    case "REPAIR_IN_PROGRESS":
    case "REPAYING":
    case "SETTLED":
      return "success";
    case "DECLINED":
    case "CANCELLED":
      return "destructive";
    default:
      return "neutral";
  }
}

function escapeCsv(val: string | number | null | undefined): string {
  const s = val === null || val === undefined ? "" : String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

export function LenderApplicationsClient({ rows }: { rows: LenderAppRow[] }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "ALL" && r.appStatus !== statusFilter) return false;
      if (!q) return true;
      return (
        (r.reference ?? "").toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        (r.regNo ?? "").toLowerCase().includes(q) ||
        (r.makeModel ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, statusFilter]);

  function exportCsv() {
    const header = [
      "reference",
      "status",
      "product",
      "customer_name",
      "vehicle_reg",
      "make_model",
      "financed_amount_kes",
      "payment_approval_recorded",
      "repayment_state",
      "submitted_at",
    ];
    const lines = [
      header.join(","),
      ...filtered.map((r) =>
        [
          r.reference ?? "",
          r.appStatus,
          r.productCode,
          r.customerName,
          r.regNo ?? "",
          r.makeModel ?? "",
          r.financedAmountKes ?? "",
          r.hasLenderApproval ? "yes" : "no",
          r.repaymentState ?? "",
          r.submittedAtFormatted,
        ]
          .map(escapeCsv)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lender-applications-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <Input
            placeholder="Search reference, customer, or plate..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-xs"
          />
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-foreground"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
          Export CSV ({filtered.length})
        </Button>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No applications match your current filter.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">Customer & vehicle</th>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Financed</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Repayment</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((row) => (
                  <tr key={row.submissionId} className="hover:bg-surface-muted/50">
                    <td className="px-4 py-3 font-mono text-xs font-semibold">
                      <Link
                        href={`/lender/applications/${encodeURIComponent(row.reference ?? row.applicationId)}`}
                        className="text-accent hover:underline"
                      >
                        {row.reference}
                      </Link>
                      <div className="font-sans text-[11px] font-normal text-muted-foreground">
                        v{row.packageVersion} | {row.submittedAtFormatted}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{row.customerName}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.regNo ?? "No plate"} {row.makeModel ? `— ${row.makeModel}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {row.productCode === "RIDE_HAILING" ? "Ride-hailing" : "Salaried"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {row.financedAmountKes !== null
                        ? `KES ${row.financedAmountKes.toLocaleString("en-KE")}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={badgeVariant(row.appStatus)}>{row.appStatus}</Badge>
                      {row.appStatus === "APPROVED" && !row.hasLenderApproval ? (
                        <div className="mt-1 text-[11px] font-medium text-warning">
                          Needs payment approval
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs capitalize text-muted-foreground">
                      {row.repaymentState ? row.repaymentState.replace("_", " ") : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/lender/applications/${encodeURIComponent(row.reference ?? row.applicationId)}`}
                        className="text-xs font-medium text-accent hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
