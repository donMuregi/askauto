import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import { applications, jobCardPhotos, jobCards } from "@/server/db/schema";
import { audit } from "@/server/domain/audit";
import { getPrivateObject } from "@/server/integrations/storage";
import { can } from "@/server/policies/can";

function guessContentType(storageKey: string): string {
  const lower = storageKey.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "image/jpeg";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireUser({ mode: "throw" });
    const { id } = await context.params;
    const db = getDb();

    const [photo] = await db
      .select()
      .from(jobCardPhotos)
      .where(eq(jobCardPhotos.id, id))
      .limit(1);
    if (!photo) {
      return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    }

    const [job] = await db
      .select()
      .from(jobCards)
      .where(eq(jobCards.id, photo.jobCardId))
      .limit(1);
    if (!job) {
      return NextResponse.json({ error: "Job card not found." }, { status: 404 });
    }

    const [app] = await db
      .select({ customerId: applications.customerId })
      .from(applications)
      .where(eq(applications.id, job.applicationId))
      .limit(1);

    const allowed =
      can(ctx.actor, "job_card:read", { garageId: job.garageId }) ||
      (ctx.user.kind === "customer" && Boolean(app && app.customerId === ctx.actor.customerId));

    if (!allowed) {
      return NextResponse.json({ error: "Access denied." }, { status: 403 });
    }

    await audit({
      db,
      actor: ctx.actor,
      action: "job_card_photo.viewed",
      entityType: "job_card_photo",
      entityId: photo.id,
      meta: { jobCardId: job.id, kind: photo.kind },
    });

    const obj = await getPrivateObject(photo.storageKey);
    if (!obj) {
      return NextResponse.json({ error: "Stored file missing." }, { status: 404 });
    }
    if (obj.kind === "redirect") {
      return NextResponse.redirect(obj.url);
    }

    return new NextResponse(new Uint8Array(obj.buffer), {
      status: 200,
      headers: {
        "Content-Type": guessContentType(photo.storageKey),
        "Content-Disposition": `inline; filename="${photo.kind}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Access denied.";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
