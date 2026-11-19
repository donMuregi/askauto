import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createRequestId, createRequestLogger } from "@/lib/logger";
import { getDb } from "@/server/db/client";

export async function GET(request: Request) {
  const requestId = createRequestId(request.headers.get("x-request-id"));
  const log = createRequestLogger(requestId);
  const startedAt = Date.now();

  try {
    await getDb().execute(sql`SELECT 1`);
    const latencyMs = Date.now() - startedAt;
    return NextResponse.json(
      {
        status: "ok",
        database: "ok",
        latencyMs,
        requestId,
      },
      {
        status: 200,
        headers: { "x-request-id": requestId },
      },
    );
  } catch (err) {
    log.error({ err }, "health check database ping failed");
    return NextResponse.json(
      {
        status: "degraded",
        database: "unavailable",
        requestId,
      },
      {
        status: 503,
        headers: { "x-request-id": requestId },
      },
    );
  }
}
