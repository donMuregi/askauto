import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKenyanDateTime } from "@/lib/format";
import { requireCustomer } from "@/server/auth/guards";
import { getUserConsentsHistory } from "@/server/auth/service";
import { PrivacyActions } from "./privacy-actions";

export const dynamic = "force-dynamic";

export default async function AccountPrivacyPage() {
  const ctx = await requireCustomer({ verified: false, nextPath: "/account/privacy" });
  const consents = ctx.actor.customerId ? await getUserConsentsHistory(ctx.actor.customerId) : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Privacy</h1>

      <PrivacyActions />

      <Card>
        <CardHeader>
          <CardTitle>Consent history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {consents.length === 0 ? (
            <p className="text-muted-foreground">No application consent records yet.</p>
          ) : (
            consents.map((c) => (
              <div key={c.id} className="rounded border border-border p-3">
                <p className="font-medium">Consent Notice {c.noticeVersion}</p>
                <p className="text-xs text-muted-foreground">
                  Accepted {formatKenyanDateTime(c.acceptedAt)}
                </p>
              </div>
            ))
          )}
          <div className="flex flex-wrap gap-4 pt-2 text-xs">
            <Link href="/legal/privacy" className="text-accent hover:underline">
              Privacy Notice
            </Link>
            <Link href="/legal/terms" className="text-accent hover:underline">
              Terms of Use
            </Link>
            <Link href="/legal/consent-notice" className="text-accent hover:underline">
              Consent Notice
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
