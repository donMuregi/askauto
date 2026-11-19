"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatKes } from "@/lib/format";
import { estimateDailyRepayment, type DailyEstimateConfig } from "@/server/domain/applications/estimate";
import type { AvailableSlot } from "@/server/domain/applications/service";
import { createBookingAndPay, simulateFakeMpesaCallback } from "../../actions";

interface BookFormProps {
  applicationId: string;
  reference: string;
  productCode: "RIDE_HAILING" | "SALARIED";
  garages: Array<{ id: string; name: string; branchName: string | null; address: string }>;
  slots: AvailableSlot[];
  defaultPhone: string;
  feeKes: number;
  estimateConfig: DailyEstimateConfig;
  isFakeMode: boolean;
}

export function BookForm({
  applicationId,
  reference,
  productCode,
  garages,
  slots,
  defaultPhone,
  feeKes,
  estimateConfig,
  isFakeMode,
}: BookFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [depositKes, setDepositKes] = useState(0);
  const [selectedGarageId, setSelectedGarageId] = useState(garages[0]?.id ?? "");
  const [selectedSlot, setSelectedSlot] = useState(() => {
    const first = slots.find((s) => s.available);
    return first ? `${first.slotStartIso}|${first.slotEndIso}` : "";
  });
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
  const [stkMessage, setStkMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const estimate = estimateDailyRepayment({
    depositKes,
    config: estimateConfig,
  });

  function handlePaySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStkMessage(null);
    const fd = new FormData(event.currentTarget);

    startTransition(async () => {
      const res = await createBookingAndPay(fd);
      if (!res.ok) {
        setError(res.error ?? "Could not initiate M-Pesa payment.");
        return;
      }
      setCheckoutRequestId(res.checkoutRequestId ?? null);
      setStkMessage(res.message ?? "Check your phone and enter your M-Pesa PIN.");
    });
  }

  function handleSimulate(outcome: "success" | "cancel" | "timeout" | "insufficient") {
    if (!checkoutRequestId) return;
    setError(null);
    startTransition(async () => {
      const res = await simulateFakeMpesaCallback(checkoutRequestId, outcome);
      if (!res.ok) {
        setError(res.error ?? "Payment failed. Try again.");
        setCheckoutRequestId(null);
        return;
      }
      if (res.redirectTo) {
        router.push(res.redirectTo);
      }
    });
  }

  return (
    <div className="space-y-6">
      {error ? <Alert variant="error">{error}</Alert> : null}

      <form onSubmit={handlePaySubmit} className="space-y-6">
        <input type="hidden" name="applicationId" value={applicationId} />

        {productCode === "RIDE_HAILING" ? (
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Estimated daily repayment</CardTitle>
                <Badge variant="neutral">Indicative only</Badge>
              </div>
              <CardDescription>{estimate.indicativeLabel}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md bg-surface-muted p-4">
                <p className="text-2xl font-bold text-foreground">
                  About {formatKes(estimate.dailyRepaymentKes)} / day
                </p>
                <p className="text-xs text-muted-foreground">
                  Based on an example {formatKes(estimateConfig.defaultAssumedRepairKes)} repair
                  minus {formatKes(depositKes)} optional deposit.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="depositKes">Optional deposit (KES)</Label>
                <Input
                  id="depositKes"
                  name="depositKes"
                  type="number"
                  min={0}
                  step={500}
                  value={depositKes}
                  onChange={(e) => setDepositKes(Math.max(0, Number(e.target.value) || 0))}
                />
                <p className="text-xs text-muted-foreground">
                  Paid directly to Ask AutoParts if chosen; reduces the financed amount.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <input type="hidden" name="depositKes" value="0" />
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Select garage and inspection slot</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="garageId">Garage</Label>
              <select
                id="garageId"
                name="garageId"
                value={selectedGarageId}
                onChange={(e) => setSelectedGarageId(e.target.value)}
                required
                className="flex min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm"
              >
                {garages.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.branchName ? `${g.branchName} — ${g.address}` : `${g.name} — ${g.address}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="slotValue">Inspection slot</Label>
              <select
                id="slotValue"
                name="slotValue"
                value={selectedSlot}
                onChange={(e) => setSelectedSlot(e.target.value)}
                required
                className="flex min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm"
              >
                {slots.map((slot) => (
                  <option
                    key={slot.slotStartIso}
                    value={`${slot.slotStartIso}|${slot.slotEndIso}`}
                    disabled={!slot.available}
                  >
                    {slot.label}
                    {!slot.available ? " (Full)" : ""}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inspection booking payment</CardTitle>
            <CardDescription>
              Reference: {reference}. {formatKes(feeKes)} is the only fee, and it is never financed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-md border border-border bg-surface-muted px-4 py-3 text-sm">
              <span>Pre-inspection diagnostic fee</span>
              <span className="text-base font-bold">{formatKes(feeKes)}</span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mpesaPhone">M-Pesa phone number</Label>
              <Input
                id="mpesaPhone"
                name="mpesaPhone"
                type="tel"
                defaultValue={defaultPhone}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={isPending || Boolean(checkoutRequestId)}>
              {isPending ? "Sending M-Pesa prompt..." : `Pay ${formatKes(feeKes)} by M-Pesa`}
            </Button>

            <p className="text-xs text-muted-foreground">
              Prefer manual Paybill? Paybill 880100, Account 531974, Amount {formatKes(feeKes)}.
            </p>
          </CardContent>
        </Card>
      </form>

      {checkoutRequestId ? (
        <Card className="border-brand">
          <CardHeader>
            <CardTitle className="text-base">Awaiting M-Pesa confirmation</CardTitle>
            <CardDescription>{stkMessage}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs font-mono text-muted-foreground">
              Request ID: {checkoutRequestId}
            </p>
            {isFakeMode ? (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs font-semibold text-muted-foreground">
                  Development simulator (INTEGRATIONS_MODE=fake)
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleSimulate("success")}
                    disabled={isPending}
                  >
                    Simulate M-Pesa Success
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSimulate("cancel")}
                    disabled={isPending}
                  >
                    Simulate Cancel (1032)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSimulate("timeout")}
                    disabled={isPending}
                  >
                    Simulate Timeout (1037)
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSimulate("insufficient")}
                    disabled={isPending}
                  >
                    Simulate Insufficient Funds (1)
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
