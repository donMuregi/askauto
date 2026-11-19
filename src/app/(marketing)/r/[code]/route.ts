import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const { code } = await context.params;
  const cleaned = code.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);

  const destination = new URL("/fnpl", request.url);
  const response = NextResponse.redirect(destination);

  if (cleaned) {
    response.cookies.set("fnpl_source_code", cleaned, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 90,
    });
  }

  return response;
}
