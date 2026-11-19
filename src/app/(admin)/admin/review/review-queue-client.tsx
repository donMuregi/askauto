"use client";

import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatKes } from "@/lib/format";
import { claimTaskAction } from "../actions";

export interface QueueRowItem {
  id: string;
  reference: string;
  status: string;
  productCode: string;
  customerName: string;
  customerPhone: string | null;
  regNo: string | null;
  makeModel: string | null;
  lenderName: string | null;
  assigneeName: string | null;
  scopeTotalKes: number | null;
  updatedAtFormatted: string;
  slaDueFormatted: string | null;
}

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "REPORT_SUBMITTED", label: "Reports to release" },
  { value: "REPORT_READY", label: "Scopes to build" },
  { value: "REPAIR_APPROVED", label: "Awaiting customer docs" },
  { value: "UNDER_REVIEW", label: "Documents to review" },
  { value: "WITH_LENDER", label: "With lender" },
] as const;

export function ReviewQueueClient({
  rows,
  initialStatus,
}: {
  rows: QueueRowItem[];
  initialStatus: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState(initialStatus || "all");
  const [productFilter, setProductFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (productFilter !== "all" && r.productCode !== productFilter) return false;
      if (!q) return true;
      return (
        r.reference.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        (r.regNo?.toLowerCase().includes(q) ?? false) ||
        (r.customerPhone?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, statusFilter, productFilter, search]);

  function handleClaim(e: React.MouseEvent, applicationId: string) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      await claimTaskAction(applicationId);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={`min-h-9 rounded-md border px-3 text-xs font-medium cursor-pointer ${
                statusFilter === f.value
                  ? "border-brand bg-brand text-brand-foreground"
                  : "border-border bg-surface text-foreground hover:bg-surface-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            aria-label="Filter by product"
            className="min-h-10 rounded-md border border-border-strong bg-surface px-3 text-xs"
          >
            <option value="all">All products</option>
            <option value="RIDE_HAILING">Ride-hailing</option>
            <option value="SALARIED">Salaried</option>
          </select>

          <div className="relative w-64">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ref, plate, name..."
              className="min-h-10 pl-9 text-xs"
            />
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No applications match the selected filters.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((row) => (
            <Link
              key={row.id}
              href={`/admin/review/${encodeURIComponent(row.reference)}`}
              className="block rounded-2xl border border-border bg-surface p-4 shadow-xs transition-colors hover:border-border-strong hover:bg-surface-muted/40"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">{row.reference}</span>
                    <Badge variant="brand">{row.status}</Badge>
                    <Badge variant="neutral">{row.productCode}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {row.customerName}
                    {row.regNo ? ` | ${row.regNo} (${row.makeModel ?? ""})` : ""}
                    {row.lenderName ? ` | Partner: ${row.lenderName}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Assignee: {row.assigneeName ?? "Unassigned"} | Updated: {row.updatedAtFormatted}
                    {row.slaDueFormatted ? ` | SLA due: ${row.slaDueFormatted}` : ""}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {row.scopeTotalKes !== null ? (
                    <span className="text-sm font-semibold">{formatKes(row.scopeTotalKes)}</span>
                  ) : null}
                  {!row.assigneeName ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending}
                      onClick={(e) => handleClaim(e, row.id)}
                    >
                      Claim
                    </Button>
                  ) : null}
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
                    Review
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
