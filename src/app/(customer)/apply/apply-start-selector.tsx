"use client";

import { Car, Briefcase } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startApplication } from "./actions";

interface EmployerOption {
  employerId: string;
  employerName: string;
  lenderName: string;
}

const PLATFORMS = [
  { value: "uber", label: "Uber" },
  { value: "bolt", label: "Bolt" },
  { value: "little", label: "Little" },
  { value: "other", label: "Other app" },
] as const;

export function ApplyStartSelector({ employers }: { employers: EmployerOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<"RIDE_HAILING" | "SALARIED" | null>(null);
  const [platform, setPlatform] = useState<"uber" | "bolt" | "little" | "other">("uber");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const res = await startApplication(formData);
      if (!res.ok) {
        setError(res.error ?? "Could not start your application.");
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

      <div className="grid gap-4 md:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            setSelected("RIDE_HAILING");
            setError(null);
          }}
          aria-pressed={selected === "RIDE_HAILING"}
          className={`text-left rounded-lg border p-6 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
            selected === "RIDE_HAILING"
              ? "border-brand bg-brand-soft/40 ring-1 ring-brand"
              : "border-border bg-surface hover:border-brand/60 hover:bg-surface-muted/50"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-brand-soft text-brand">
              <Car className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-base font-semibold text-foreground">
              I drive for Uber, Bolt or another app
            </span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Daily repayment through our financing partner for ride-hailing drivers.
          </p>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelected("SALARIED");
            setError(null);
          }}
          aria-pressed={selected === "SALARIED"}
          className={`text-left rounded-lg border p-6 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
            selected === "SALARIED"
              ? "border-accent bg-accent-soft/40 ring-1 ring-accent"
              : "border-border bg-surface hover:border-accent/60 hover:bg-surface-muted/50"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-accent-soft text-accent">
              <Briefcase className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-base font-semibold text-foreground">
              I am a salaried employee
            </span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Monthly payroll deduction through your registered employer scheme.
          </p>
        </button>
      </div>

      {selected === "RIDE_HAILING" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Select your ride-hailing app</CardTitle>
            <CardDescription>
              Open to drivers on any ride-hailing app.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input type="hidden" name="product" value="RIDE_HAILING" />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PLATFORMS.map((p) => (
                  <label
                    key={p.value}
                    className={`flex min-h-11 cursor-pointer items-center justify-center rounded-md border px-3 text-sm font-medium ${
                      platform === p.value
                        ? "border-brand bg-brand-soft text-foreground"
                        : "border-border bg-surface text-muted-foreground hover:bg-surface-muted"
                    }`}
                  >
                    <input
                      type="radio"
                      name="platform"
                      value={p.value}
                      checked={platform === p.value}
                      onChange={() => setPlatform(p.value)}
                      className="sr-only"
                    />
                    {p.label}
                  </label>
                ))}
              </div>

              {platform === "other" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="platformOther">App name</Label>
                  <Input
                    id="platformOther"
                    name="platformOther"
                    type="text"
                    placeholder="Enter the app name"
                    required
                  />
                </div>
              ) : null}

              <Button type="submit" disabled={isPending}>
                {isPending ? "Starting application..." : "Continue"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {selected === "SALARIED" ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Confirm your employer scheme</CardTitle>
            <CardDescription>
              Select your registered employer and enter your employee number.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input type="hidden" name="product" value="SALARIED" />
              <div className="space-y-1.5">
                <Label htmlFor="employerId">Employer</Label>
                <select
                  id="employerId"
                  name="employerId"
                  required
                  defaultValue=""
                  className="flex min-h-11 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <option value="" disabled>
                    Select your employer
                  </option>
                  {employers.map((emp) => (
                    <option key={emp.employerId} value={emp.employerId}>
                      {emp.employerName} ({emp.lenderName})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="employeeNumber">Employee number</Label>
                <Input
                  id="employeeNumber"
                  name="employeeNumber"
                  type="text"
                  placeholder="e.g. SLK-1001"
                  required
                />
              </div>

              <Button type="submit" variant="accent" disabled={isPending}>
                {isPending ? "Checking eligibility..." : "Continue"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
