import { NextResponse, type NextRequest } from "next/server";
import { createRequestId } from "@/lib/logger";

const PROTECTED_PREFIXES = ["/apply", "/account", "/admin", "/assessor", "/garage", "/lender"];

function hasSessionCookie(request: NextRequest): boolean {
  return (
    request.cookies.has("fnpl.session_token") ||
    request.cookies.has("__Secure-fnpl.session_token") ||
    request.cookies.has("better-auth.session_token") ||
    request.cookies.has("__Secure-better-auth.session_token")
  );
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const requestId = createRequestId(request.headers.get("x-request-id"));

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  // Cheap cookie presence redirect only; every page, action, and route handler re-checks with guards
  if (isProtected && !hasSessionCookie(request)) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("next", `${pathname}${search}`);
    const response = NextResponse.redirect(signInUrl);
    response.headers.set("x-request-id", requestId);
    return response;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
