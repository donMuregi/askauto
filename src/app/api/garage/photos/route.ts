import { NextResponse } from "next/server";
import { z } from "zod";
import { isDomainError } from "@/lib/errors";
import { requireStaff } from "@/server/auth/guards";
import { addJobCardPhotoService, type PhotoKind } from "@/server/domain/garage/service";

const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const kindSchema = z.enum(["before", "after", "old_parts", "alignment"]);

export async function POST(request: Request) {
  try {
    const ctx = await requireStaff(["garage", "admin", "ops_reviewer", "ops_approver"], {
      mode: "throw",
    });

    const formData = await request.formData();
    const jobId = String(formData.get("jobId") ?? "");
    const rawKind = String(formData.get("kind") ?? "");
    const file = formData.get("file");

    if (!z.string().uuid().safeParse(jobId).success) {
      return NextResponse.json({ error: "Invalid job card ID." }, { status: 400 });
    }
    const kindParsed = kindSchema.safeParse(rawKind);
    if (!kindParsed.success) {
      return NextResponse.json({ error: "Invalid photo category." }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Select a photo file to upload." }, { status: 400 });
    }
    if (!ALLOWED_MIMES.has(file.type)) {
      return NextResponse.json(
        { error: "Upload a JPG, PNG, WebP image, or PDF printout." },
        { status: 400 },
      );
    }
    if (file.size <= 0 || file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: "File must be smaller than 10 MB." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const ext = file.name.split(".").pop() ?? (file.type === "application/pdf" ? "pdf" : "jpg");

    const photo = await addJobCardPhotoService(ctx.actor, {
      jobId,
      kind: kindParsed.data as PhotoKind,
      fileBuffer: Buffer.from(arrayBuffer),
      contentType: file.type,
      ext,
    });

    return NextResponse.json({ id: photo.id, kind: photo.kind }, { status: 201 });
  } catch (err) {
    if (isDomainError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    }
    return NextResponse.json({ error: "Photo upload failed." }, { status: 500 });
  }
}
