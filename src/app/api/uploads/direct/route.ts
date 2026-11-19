import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { uuidv7 } from "uuidv7";
import { encryptField, sha256Hex } from "@/lib/crypto";
import { requireUser } from "@/server/auth/guards";
import { getDb } from "@/server/db/client";
import {
  applications,
  productDocumentRequirements,
  uploads,
} from "@/server/db/schema";
import { audit } from "@/server/domain/audit";
import { putPrivateObject } from "@/server/integrations/storage";
import { authorize } from "@/server/policies/can";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export async function POST(request: Request) {
  try {
    const ctx = await requireUser({ mode: "throw" });
    const formData = await request.formData();

    const applicationId = String(formData.get("applicationId") ?? "");
    const docType = String(formData.get("docType") ?? "") as (typeof uploads.$inferInsert)["docType"];
    const file = formData.get("file");
    const filePassword =
      typeof formData.get("filePassword") === "string"
        ? String(formData.get("filePassword")).trim()
        : "";

    if (!applicationId || !docType || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Provide applicationId, docType, and a file to upload." },
        { status: 400 },
      );
    }

    if (file.size <= 0 || file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File must be smaller than 10 MB." },
        { status: 400 },
      );
    }

    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: "Upload a JPEG, PNG, WebP image, or PDF document." },
        { status: 400 },
      );
    }

    const db = getDb();
    const [app] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, applicationId))
      .limit(1);

    if (!app) {
      return NextResponse.json({ error: "Application not found." }, { status: 404 });
    }

    authorize(ctx.actor, "upload:create", { customerId: app.customerId });

    const [reqRow] = await db
      .select()
      .from(productDocumentRequirements)
      .where(
        and(
          eq(productDocumentRequirements.productCode, app.productCode),
          eq(productDocumentRequirements.docType, docType),
        ),
      )
      .limit(1);

    if (!reqRow) {
      return NextResponse.json(
        { error: "This document type is not part of this application's checklist." },
        { status: 400 },
      );
    }

    if (reqRow.uploadedBy === "ops" && ctx.user.kind === "customer") {
      return NextResponse.json(
        { error: "This document is uploaded by Ask AutoParts operations." },
        { status: 403 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = sha256Hex(buffer);
    const ext =
      file.type === "application/pdf"
        ? "pdf"
        : file.type === "image/png"
          ? "png"
          : file.type === "image/webp"
            ? "webp"
            : "jpg";
    const storageKey = `uploads/${app.id}/${docType}/${uuidv7()}.${ext}`;

    await putPrivateObject({
      key: storageKey,
      body: buffer,
      contentType: file.type,
    });

    const [created] = await db
      .insert(uploads)
      .values({
        applicationId: app.id,
        docType,
        uploadedByUserId: ctx.user.id,
        storageKey,
        mime: file.type,
        sizeBytes: file.size,
        sha256,
        filePasswordEnc: filePassword ? encryptField(filePassword) : null,
        status: reqRow.uploadedBy === "ops" ? "approved" : "uploaded",
        virusScan: "pending",
      })
      .returning();

    // Mark previous active uploads of the same docType as replaced while keeping review history
    const prior = await db
      .select({ id: uploads.id })
      .from(uploads)
      .where(
        and(
          eq(uploads.applicationId, app.id),
          eq(uploads.docType, docType),
        ),
      );

    for (const row of prior) {
      if (row.id !== created.id) {
        await db
          .update(uploads)
          .set({ status: "replaced", replacedBy: created.id, updatedAt: new Date() })
          .where(eq(uploads.id, row.id));
      }
    }

    await audit({
      db,
      actor: ctx.actor,
      action: "upload.created",
      entityType: "upload",
      entityId: created.id,
      meta: { applicationId: app.id, docType, sizeBytes: file.size },
    });

    return NextResponse.json({
      ok: true,
      upload: {
        id: created.id,
        docType: created.docType,
        status: created.status,
        sizeBytes: created.sizeBytes,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
