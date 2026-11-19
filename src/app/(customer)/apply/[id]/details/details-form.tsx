"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitDetails } from "../../actions";

interface DetailsFormProps {
  applicationId: string;
  productCode: "RIDE_HAILING" | "SALARIED";
  userName: string;
  userEmail: string;
  userPhone: string | null;
  yearsInService: number | null;
  consentNoticeText: string;
  consentVersion: string;
}

export function DetailsForm({
  applicationId,
  productCode,
  userName,
  userEmail,
  userPhone,
  yearsInService,
  consentNoticeText,
  consentVersion,
}: DetailsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const fd = new FormData(event.currentTarget);

    startTransition(async () => {
      const res = await submitDetails(fd);
      if (!res.ok) {
        setError(res.error ?? "Check your details and try again.");
        return;
      }
      if (res.redirectTo) {
        router.push(res.redirectTo);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <input type="hidden" name="applicationId" value={applicationId} />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your account details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Full name</p>
            <p className="font-medium">{userName}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Phone</p>
            <p className="font-medium">{userPhone ?? "Not set"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="font-medium break-all">{userEmail}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Identity and vehicle details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="nationalId">National ID number</Label>
              <Input
                id="nationalId"
                name="nationalId"
                type="text"
                inputMode="numeric"
                placeholder="e.g. 34567890"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="regNo">Vehicle registration plate</Label>
              <Input
                id="regNo"
                name="regNo"
                type="text"
                placeholder="e.g. KDJ 123A"
                required
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="makeModel">Make and model</Label>
              <Input
                id="makeModel"
                name="makeModel"
                type="text"
                placeholder="e.g. Toyota Fielder"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="year">Year of manufacture (optional)</Label>
              <Input
                id="year"
                name="year"
                type="number"
                min={1980}
                max={2027}
                placeholder="e.g. 2017"
              />
            </div>
          </div>

          {productCode === "SALARIED" ? (
            <div className="rounded-md border border-border bg-surface-muted p-3 text-sm">
              <span className="text-muted-foreground">Years in service (from employer list): </span>
              <span className="font-semibold">{yearsInService ?? 0} years</span>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="faultDescription">Describe the vehicle issue or repair needed</Label>
            <textarea
              id="faultDescription"
              name="faultDescription"
              rows={3}
              required
              placeholder="e.g. Clutch slipping on hills and front suspension knocking"
              className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Consent Notice ({consentVersion})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="rounded-md bg-surface-muted p-3 text-xs leading-relaxed text-muted-foreground">
            {consentNoticeText}
          </p>
          <label className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              name="consentAccepted"
              required
              className="mt-1 h-4 w-4 accent-brand"
            />
            <span>
              I accept the{" "}
              <Link href="/legal/consent-notice" className="font-medium underline">
                Consent Notice
              </Link>
              .
            </span>
          </label>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-4">
        <Link href="/account" className="text-sm font-medium text-muted-foreground hover:text-foreground">
          Save and return later
        </Link>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving details..." : "Continue to booking"}
        </Button>
      </div>
    </form>
  );
}
