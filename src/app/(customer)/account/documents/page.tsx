import { desc, eq } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatKenyanDate } from "@/lib/format";
import { requireCustomer } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { applications, documents } from "@/server/db/schema";

export const dynamic = "force-dynamic";

export default async function AccountDocumentsPage() {
  const ctx = await requireCustomer({ verified: true, nextPath: "/account/documents" });
  const rows = ctx.actor.customerId
    ? await getDb()
        .select({
          doc: documents,
          reference: applications.reference,
        })
        .from(documents)
        .innerJoin(applications, eq(documents.applicationId, applications.id))
        .where(eq(applications.customerId, ctx.actor.customerId))
        .orderBy(desc(documents.createdAt))
    : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Issued documents will appear here once generated.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map(({ doc, reference }) => (
            <Card key={doc.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{doc.docNumber}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span>
                  {doc.type} | {reference ?? "Draft"} |{" "}
                  {doc.issuedAt ? formatKenyanDate(doc.issuedAt) : "Pending"}
                </span>
                {doc.pdfKey ? (
                  <a
                    href={`/api/files/${doc.id}`}
                    className="font-medium text-accent hover:underline"
                  >
                    Download PDF
                  </a>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
