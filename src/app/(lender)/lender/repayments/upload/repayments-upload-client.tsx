"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { submitManualRepaymentAction, uploadRepaymentCsvAction } from "../../actions";

const CSV_TEMPLATE = [
  "reference,as_of_date,state,installments_paid,installments_missed,note",
  "AAP/FNPL/2026/0001,2026-11-20,current,5,0,On schedule",
].join("\n");

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export function RepaymentsUploadClient({
  activeReferences,
}: {
  activeReferences: Array<{ reference: string; customerName: string; status: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // CSV upload state
  const [csvText, setCsvText] = useState("");
  const [csvFeedback, setCsvFeedback] = useState<{
    type: "success" | "error";
    text: string;
    rowErrors?: Array<{ row: number; error: string }>;
  } | null>(null);

  // Single manual update state
  const [reference, setReference] = useState(activeReferences[0]?.reference ?? "");
  const [asOfDate, setAsOfDate] = useState(todayDate);
  const [state, setState] = useState<"current" | "catch_up" | "arrears" | "settled">("current");
  const [paid, setPaid] = useState("1");
  const [missed, setMissed] = useState("0");
  const [note, setNote] = useState("");
  const [manualFeedback, setManualFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  function downloadTemplate() {
    const blob = new Blob([CSV_TEMPLATE], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "repayment-report-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
  }

  function handleCsvSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCsvFeedback(null);
    startTransition(async () => {
      const res = await uploadRepaymentCsvAction(csvText);
      if (!res.ok) {
        setCsvFeedback({ type: "error", text: res.error ?? "Upload failed." });
        return;
      }
      setCsvFeedback({
        type: "success",
        text: res.message ?? "CSV imported.",
        rowErrors: res.rowErrors,
      });
      router.refresh();
    });
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    setManualFeedback(null);
    startTransition(async () => {
      const res = await submitManualRepaymentAction({
        reference,
        asOfDate,
        state,
        installmentsPaid: Number(paid),
        installmentsMissed: Number(missed),
        note: note || undefined,
      });
      if (!res.ok) {
        setManualFeedback({ type: "error", text: res.error ?? "Failed to record update." });
        return;
      }
      setNote("");
      setManualFeedback({ type: "success", text: res.message ?? "Repayment status recorded." });
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Bulk CSV upload</CardTitle>
              <CardDescription>
                Columns: reference, as_of_date (YYYY-MM-DD), state (current|catch_up|arrears|settled), installments_paid, installments_missed, note.
              </CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
              Download template
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCsvSubmit} className="space-y-4">
            {csvFeedback ? (
              <Alert variant={csvFeedback.type === "error" ? "error" : "success"}>
                <p>{csvFeedback.text}</p>
                {csvFeedback.rowErrors && csvFeedback.rowErrors.length > 0 ? (
                  <ul className="mt-2 list-disc pl-4 text-xs">
                    {csvFeedback.rowErrors.map((err) => (
                      <li key={`${err.row}-${err.error}`}>
                        Row {err.row}: {err.error}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Alert>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="csvFile">Choose CSV file</Label>
              <Input id="csvFile" type="file" accept=".csv,text/csv" onChange={handleFileSelect} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="csvText">Or paste CSV rows</Label>
              <textarea
                id="csvText"
                rows={7}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder={CSV_TEMPLATE}
                className="w-full rounded-md border border-border bg-surface p-3 font-mono text-xs text-foreground"
              />
            </div>

            <Button type="submit" disabled={isPending || !csvText.trim()}>
              {isPending ? "Importing..." : "Import repayment CSV"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Single application update</CardTitle>
          <CardDescription>
            Record an individual repayment status report. Marking a repaying application as settled transitions it to SETTLED.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleManualSubmit} className="space-y-4">
            {manualFeedback ? (
              <Alert variant={manualFeedback.type === "error" ? "error" : "success"}>
                {manualFeedback.text}
              </Alert>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="manualRef">Application reference</Label>
              {activeReferences.length > 0 ? (
                <select
                  id="manualRef"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground"
                >
                  {activeReferences.map((item) => (
                    <option key={item.reference} value={item.reference}>
                      {item.reference} — {item.customerName} ({item.status})
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  id="manualRef"
                  required
                  placeholder="AAP/FNPL/2026/0001"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="manualDate">As-of date</Label>
                <Input
                  id="manualDate"
                  type="date"
                  required
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manualState">Repayment state</Label>
                <select
                  id="manualState"
                  value={state}
                  onChange={(e) =>
                    setState(e.target.value as "current" | "catch_up" | "arrears" | "settled")
                  }
                  className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-foreground"
                >
                  <option value="current">Current</option>
                  <option value="catch_up">Catch-up</option>
                  <option value="arrears">Arrears</option>
                  <option value="settled">Settled</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="manualPaid">Instalments paid</Label>
                <Input
                  id="manualPaid"
                  type="number"
                  min={0}
                  required
                  value={paid}
                  onChange={(e) => setPaid(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="manualMissed">Instalments missed</Label>
                <Input
                  id="manualMissed"
                  type="number"
                  min={0}
                  required
                  value={missed}
                  onChange={(e) => setMissed(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="manualNote">Note (optional)</Label>
              <Input
                id="manualNote"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Optional note"
              />
            </div>

            <Button type="submit" disabled={isPending || !reference.trim()}>
              {isPending ? "Saving..." : "Record repayment report"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
