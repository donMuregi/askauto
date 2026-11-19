"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatKes } from "@/lib/format";
import { signScope } from "../../../apply/actions";

interface ScopeApprovalPanelProps {
  applicationId: string;
  customerName: string;
  findings: Array<{
    id: string;
    componentLabel: string;
    findingText: string;
    recommendedAction: string;
    urgency: string;
  }>;
  scope: {
    id: string;
    version: number;
    status: string;
    vatRatePct: number;
    subtotalKes: number;
    vatKes: number;
    totalKes: number;
  } | null;
  items: Array<{
    id: string;
    serviceCode: string;
    description: string;
    partGrade: string;
    partBrand: string | null;
    partsKes: number;
    labourKes: number;
    lineTotalKes: number;
    decision: string;
  }>;
}

export function ScopeApprovalPanel({
  applicationId,
  customerName,
  findings,
  scope,
  items,
}: ScopeApprovalPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [approvedIds, setApprovedIds] = useState<string[]>(() =>
    items.filter((i) => i.decision !== "deferred").map((i) => i.id),
  );
  const [typedName, setTypedName] = useState(customerName);
  const [accepted, setAccepted] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(
    null,
  );

  const isSigned = scope?.status === "signed";

  const totals = useMemo(() => {
    if (!scope) return { subtotalKes: 0, vatKes: 0, totalKes: 0 };
    const selected = items.filter((i) => approvedIds.includes(i.id));
    const subtotalKes = selected.reduce((sum, i) => sum + i.partsKes + i.labourKes, 0);
    const vatKes = Math.round((subtotalKes * scope.vatRatePct) / 100);
    return { subtotalKes, vatKes, totalKes: subtotalKes + vatKes };
  }, [items, approvedIds, scope]);

  function toggleItem(id: string) {
    setApprovedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleSign(event: React.FormEvent) {
    event.preventDefault();
    if (!scope) return;
    setFeedback(null);
    if (!accepted) {
      setFeedback({ kind: "error", text: "Confirm the declaration before signing." });
      return;
    }

    startTransition(async () => {
      const res = await signScope({
        applicationId,
        scopeId: scope.id,
        approvedItemIds: approvedIds,
        typedName,
      });
      if (!res.ok) {
        setFeedback({ kind: "error", text: res.error ?? "Could not sign repair scope." });
        return;
      }
      setFeedback({ kind: "success", text: res.message ?? "Repair scope approved." });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {findings.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Diagnostic report findings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {findings.map((f) => (
              <div key={f.id} className="rounded border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{f.componentLabel}</span>
                  <Badge variant={f.urgency === "do_not_delay" ? "destructive" : "neutral"}>
                    {f.urgency.replaceAll("_", " ")}
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground">{f.findingText}</p>
                <p className="text-xs text-muted-foreground">Action: {f.recommendedAction}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {scope ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Priced repair scope (v{scope.version})</CardTitle>
                <CardDescription>
                  {isSigned
                    ? "Signed and locked. Nothing can be added without a new approval."
                    : "Choose which repair items to approve, then sign below."}
                </CardDescription>
              </div>
              <Badge variant={isSigned ? "success" : "brand"}>
                {isSigned ? "Signed" : "Awaiting your approval"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {feedback ? (
              <Alert variant={feedback.kind === "error" ? "error" : "success"}>
                {feedback.text}
              </Alert>
            ) : null}

            <div className="space-y-2">
              {items.map((item) => {
                const checked = isSigned
                  ? item.decision === "approved"
                  : approvedIds.includes(item.id);
                return (
                  <label
                    key={item.id}
                    className={`flex items-start justify-between gap-3 rounded-md border p-3 text-sm ${
                      checked ? "border-brand/50 bg-brand-soft/30" : "border-border bg-surface-muted/40"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isSigned}
                        onChange={() => toggleItem(item.id)}
                        className="mt-1 h-4 w-4 accent-brand"
                      />
                      <div>
                        <p className="font-medium">
                          {item.serviceCode} — {item.description}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Grade: {item.partGrade}
                          {item.partBrand ? ` (${item.partBrand})` : ""} | Parts:{" "}
                          {formatKes(item.partsKes)} | Labour: {formatKes(item.labourKes)}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 font-semibold">{formatKes(item.lineTotalKes)}</span>
                  </label>
                );
              })}
            </div>

            <div className="rounded-md border border-border bg-surface-muted p-4 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Approved subtotal</span>
                <span>{formatKes(isSigned ? scope.subtotalKes : totals.subtotalKes)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">VAT ({scope.vatRatePct}%)</span>
                <span>{formatKes(isSigned ? scope.vatKes : totals.vatKes)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
                <span>Approved total</span>
                <span>{formatKes(isSigned ? scope.totalKes : totals.totalKes)}</span>
              </div>
            </div>

            {!isSigned ? (
              <form onSubmit={handleSign} className="space-y-4 border-t border-border pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="typedName">Full name (electronic signature)</Label>
                  <Input
                    id="typedName"
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    required
                  />
                </div>
                <label className="flex items-start gap-2.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-brand"
                  />
                  <span>
                    I approve only the checked repair items above and understand no additional work
                    will be added without my new approval.
                  </span>
                </label>
                <Button type="submit" disabled={isPending || approvedIds.length === 0}>
                  {isPending ? "Signing..." : "Approve and sign repair scope"}
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
