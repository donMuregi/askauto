"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordFundsReceivedAction } from "../../actions";

export interface AwaitingFundsItem {
  id: string;
  reference: string | null;
  productCode: "RIDE_HAILING" | "SALARIED";
  customerName: string;
  lenderName: string | null;
  regNo: string | null;
  lenderApproval: {
    amountKes: number;
    reference: string;
    expectedDate: string | null;
    recordedAtFormatted: string;
  } | null;
  fundsReceived: {
    amountKes: number;
    reference: string;
    discrepancyFlag: boolean;
    recordedAtFormatted: string;
  } | null;
}

function kes(n: number) {
  return `KES ${n.toLocaleString("en-KE")}`;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function FundsRowCard({ item }: { item: AwaitingFundsItem }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [amountKes, setAmountKes] = useState(
    String(item.lenderApproval?.amountKes ?? ""),
  );
  const [reference, setReference] = useState("");
  const [receivedDate, setReceivedDate] = useState(todayDate);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    startTransition(async () => {
      const res = await recordFundsReceivedAction({
        applicationId: item.id,
        amountKes: Number(amountKes),
        reference,
        receivedDate,
      });
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error ?? "Failed to record funds receipt." });
        return;
      }
      setFeedback({ type: "success", text: res.message ?? "Funds receipt recorded." });
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">
              {item.reference} — {item.customerName}
            </CardTitle>
            <CardDescription>
              {item.lenderName ?? "Financing partner"} | {item.regNo ?? "No plate"} |{" "}
              {item.productCode === "RIDE_HAILING" ? "Ride-hailing" : "Salaried"}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={item.lenderApproval ? "success" : "brand"}>
              {item.lenderApproval ? "Lender approved" : "Awaiting lender approval"}
            </Badge>
            <Badge variant={item.fundsReceived ? "success" : "neutral"}>
              {item.fundsReceived ? "Funds confirmed" : "Funds pending"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {feedback ? (
          <Alert variant={feedback.type === "error" ? "error" : "success"}>{feedback.text}</Alert>
        ) : null}

        {item.lenderApproval ? (
          <div className="rounded-md border border-border bg-surface-muted px-4 py-2.5 text-xs text-muted-foreground">
            Lender payment approval: <strong className="text-foreground">{kes(item.lenderApproval.amountKes)}</strong>{" "}
            | Ref: <span className="font-mono text-foreground">{item.lenderApproval.reference}</span>
            {item.lenderApproval.expectedDate
              ? ` | Expected: ${item.lenderApproval.expectedDate}`
              : ""}{" "}
            | Recorded: {item.lenderApproval.recordedAtFormatted}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            The lender has not yet recorded payment approval. You can still confirm bank receipt if funds have already settled; the repair job card opens once both attestations exist.
          </p>
        )}

        {item.fundsReceived ? (
          <div className="rounded-md border border-success/40 bg-success-soft px-4 py-2.5 text-xs">
            Confirmed {kes(item.fundsReceived.amountKes)} (Ref: {item.fundsReceived.reference}) on{" "}
            {item.fundsReceived.recordedAtFormatted}.
            {item.fundsReceived.discrepancyFlag ? (
              <span className="ml-2 font-semibold text-destructive">
                Discrepancy flagged against lender amount.
              </span>
            ) : null}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-4 items-end">
            <div className="space-y-1">
              <Label htmlFor={`amount-${item.id}`}>Amount received (KES)</Label>
              <Input
                id={`amount-${item.id}`}
                type="number"
                min={1}
                required
                value={amountKes}
                onChange={(e) => setAmountKes(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`ref-${item.id}`}>Bank / EFT / M-Pesa ref</Label>
              <Input
                id={`ref-${item.id}`}
                required
                placeholder="e.g. BANK-CR-9921"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`date-${item.id}`}>Date received</Label>
              <Input
                id={`date-${item.id}`}
                type="date"
                required
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Confirming..." : "Confirm funds receipt"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function FundsReceiptClient({ items }: { items: AwaitingFundsItem[] }) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          No approved applications are currently awaiting funds receipt confirmation.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => (
        <FundsRowCard key={item.id} item={item} />
      ))}
    </div>
  );
}
