"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { respondToOffer } from "@/app/(customer)/apply/actions";

interface OfferPanelProps {
  applicationId: string;
  applicationStatus: string;
  customerName: string;
  offer: {
    id: string;
    customerResponse: string;
    approvedAmountKes: number | null;
    installmentKes: number | null;
    frequency: string | null;
    tenorCount: number | null;
    rateText: string | null;
    feesText: string | null;
    validUntilFormatted: string | null;
  };
}

function kes(n: number | null) {
  if (n === null || n === undefined) return "—";
  return `KES ${n.toLocaleString("en-KE")}`;
}

export function OfferPanel({
  applicationId,
  applicationStatus,
  customerName,
  offer,
}: OfferPanelProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [typedName, setTypedName] = useState(customerName);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const canRespond = applicationStatus === "OFFER_MADE" && offer.customerResponse === "pending";

  function handleRespond(response: "accepted" | "declined") {
    setFeedback(null);
    startTransition(async () => {
      const res = await respondToOffer({
        applicationId,
        offerId: offer.id,
        response,
        typedName: response === "accepted" ? typedName : undefined,
      });
      if (!res.ok) {
        setFeedback({ type: "error", text: res.error ?? "Could not record your response." });
        return;
      }
      setFeedback({ type: "success", text: res.message ?? "Response saved." });
      router.refresh();
    });
  }

  return (
    <Card className={canRespond ? "border-border-strong" : undefined}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Financing offer</CardTitle>
            <CardDescription>
              Terms offered by our financing partner for your approved repair.
            </CardDescription>
          </div>
          <Badge
            variant={
              offer.customerResponse === "accepted"
                ? "success"
                : offer.customerResponse === "declined"
                  ? "destructive"
                  : "brand"
            }
          >
            {offer.customerResponse === "pending" ? "Awaiting your response" : offer.customerResponse}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {feedback ? (
          <Alert variant={feedback.type === "error" ? "error" : "success"}>{feedback.text}</Alert>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3 rounded-md border border-border bg-surface-muted p-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Financed amount</p>
            <p className="font-mono font-semibold">{kes(offer.approvedAmountKes)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Instalment</p>
            <p className="font-mono font-semibold">
              {kes(offer.installmentKes)} / {offer.frequency === "daily" ? "day" : "month"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Tenor</p>
            <p className="font-semibold">
              {offer.tenorCount ?? "—"}{" "}
              {offer.frequency === "daily" ? "days" : "months"}
            </p>
          </div>
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          {offer.rateText ? <p>Rate: {offer.rateText}</p> : null}
          {offer.feesText ? <p>Fees: {offer.feesText}</p> : null}
          {offer.validUntilFormatted ? <p>Valid until: {offer.validUntilFormatted}</p> : null}
        </div>

        {canRespond ? (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="space-y-1.5 max-w-md">
              <Label htmlFor="offerTypedName">Type your full name to accept and sign</Label>
              <Input
                id="offerTypedName"
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Your full name"
              />
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                disabled={isPending || typedName.trim().length < 2}
                onClick={() => handleRespond("accepted")}
              >
                {isPending ? "Submitting..." : "Accept & sign offer"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={() => handleRespond("declined")}
              >
                Decline offer
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
