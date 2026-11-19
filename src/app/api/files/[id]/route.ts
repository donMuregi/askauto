import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { applications, lenderSubmissions, uploads } from "@/server/db/schema";
import { audit } from "@/server/domain/audit";
import { getPrivateObject } from "@/server/integrations/storage";
import { authorize } from "@/server/policies/can";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireUser({ mode: "throw" });
    const { id } = await context.params;
    const db = getDb();

    const [uploadRow] = await db
      .select()
      .from(uploads)
      .where(eq(uploads.id, id))
      .limit(1);

    if (!uploadRow) {
      return NextResponse.json({ error: "File not found." }, { status: 404 });
    }

    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, uploadRow.applicationId))
      .limit(1);

    if (!app) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    let hasLenderSubmission = false;
    if (ctx.user.kind === "lender" && ctx.lender) {
      const [sub] = await db
        .select({ id: lenderSubmissions.id })
        .from(lenderSubmissions)
        .where(
          and(
            eq(lenderSubmissions.applicationId, app.id),
            eq(lenderSubmissions.lenderId, ctx.lender.id),
          ),
        )
        .limit(1);
      hasLenderSubmission = Boolean(sub);
    }

    authorize(ctx.actor, "upload:read", {
      customerId: app.customerId,
      lenderId: app.lenderId,
      hasLenderSubmission,
    });

    if (uploadRow.virusScan === "infected") {
      return NextResponse.json({ error: "File quarantined." }, { status: 403 });
    }

    // R12: log every file view
    await audit({
      db,
      actor: ctx.actor,
      action: "upload.viewed",
      entityType: "upload",
      entityId: uploadRow.id,
      meta: { applicationId: app.id, docType: uploadRow.docType },
    });

    const obj = await getPrivateObject(uploadRow.storageKey);
    if (!obj) {
      return NextResponse.json({ error: "Stored file missing." }, { status: 404 });
    }

    if (obj.kind === "redirect") {
      return NextResponse.redirect(obj.url);
    }

    return new NextResponse(new Uint8Array(obj.buffer), {
      status: 200,
      headers: {
        "Content-Type": uploadRow.mime,
        "Content-Disposition": `inline; filename="${uploadRow.docType}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Access denied.";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
