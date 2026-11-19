import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DomainError } from "@/lib/errors";
import { isIpInAllowlist } from "@/lib/ip";
import { getDb } from "@/server/db/client";
import type { Actor, LenderRole, StaffRole } from "@/server/db/rls";
import { customers, lenders, lenderUsers, session as sessionTable, staffProfiles, user as userTable } from "@/server/db/schema";
import { getAuth } from "./auth";
import { getRequestMeta } from "./request-meta";
import { safeNext } from "./safe-next";

export { safeNext };

const MS_MINUTE = 60 * 1000;
const MS_HOUR = 60 * MS_MINUTE;
const MS_DAY = 24 * MS_HOUR;

export interface SessionContext {
  actor: Actor;
  sessionId: string;
  user: {
    id: string;
    name: string;
    email: string;
    emailVerified: boolean;
    phoneNumber: string | null;
    phoneNumberVerified: boolean;
    twoFactorEnabled: boolean;
    kind: "customer" | "staff" | "lender";
    status: "active" | "suspended" | "pending_invite" | "deleted";
    locale: string;
  };
  lender?: {
    id: string;
    name: string;
    status: string;
    role: LenderRole;
    ipAllowlist: string[] | null;
  } | null;
  staff?: {
    roles: StaffRole[];
    kemraNo: string | null;
    garageId: string | null;
    active: boolean;
  } | null;
}

export function isSessionExpiredByPolicy(params: {
  kind: "customer" | "staff" | "lender";
  createdAt: Date;
  lastActiveAt: Date;
  now?: Date;
}): boolean {
  const now = params.now ?? new Date();
  const ageMs = now.getTime() - params.createdAt.getTime();
  const idleMs = now.getTime() - params.lastActiveAt.getTime();

  if (params.kind === "staff") {
    return ageMs > 12 * MS_HOUR || idleMs > 30 * MS_MINUTE;
  }
  if (params.kind === "lender") {
    return ageMs > 8 * MS_HOUR || idleMs > 30 * MS_MINUTE;
  }
  // Customer: 30 days rolling (idle), 90 days absolute
  return ageMs > 90 * MS_DAY || idleMs > 30 * MS_DAY;
}

export async function getSessionContext(): Promise<SessionContext | null> {
  const hdrs = await headers();
  const meta = await getRequestMeta();
  const authInstance = getAuth();

  let baSession: Awaited<ReturnType<typeof authInstance.api.getSession>> = null;
  try {
    baSession = await authInstance.api.getSession({ headers: hdrs });
  } catch {
    return null;
  }

  if (!baSession?.session || !baSession?.user) {
    return null;
  }

  const db = getDb();
  const [dbUser] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, baSession.user.id))
    .limit(1);

  if (!dbUser || dbUser.status !== "active") {
    return null;
  }

  const [dbSession] = await db
    .select()
    .from(sessionTable)
    .where(eq(sessionTable.id, baSession.session.id))
    .limit(1);

  if (!dbSession) {
    return null;
  }

  const now = new Date();
  if (
    isSessionExpiredByPolicy({
      kind: dbUser.kind,
      createdAt: dbSession.createdAt,
      lastActiveAt: dbSession.lastActiveAt,
      now,
    })
  ) {
    await db.delete(sessionTable).where(eq(sessionTable.id, dbSession.id));
    return null;
  }

  // Touch lastActiveAt at most once per minute to limit write amplification
  if (now.getTime() - dbSession.lastActiveAt.getTime() > MS_MINUTE) {
    await db
      .update(sessionTable)
      .set({ lastActiveAt: now, updatedAt: now })
      .where(eq(sessionTable.id, dbSession.id));
  }

  let customerId: string | null = null;
  let staff: SessionContext["staff"] = null;
  let lender: SessionContext["lender"] = null;

  if (dbUser.kind === "customer") {
    const [cust] = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.userId, dbUser.id))
      .limit(1);
    customerId = cust?.id ?? null;
  } else if (dbUser.kind === "staff") {
    const [profile] = await db
      .select()
      .from(staffProfiles)
      .where(eq(staffProfiles.userId, dbUser.id))
      .limit(1);
    if (profile && profile.active) {
      staff = {
        roles: profile.roles,
        kemraNo: profile.kemraNo,
        garageId: profile.garageId,
        active: profile.active,
      };
    }
  } else if (dbUser.kind === "lender") {
    const [row] = await db
      .select({
        lenderId: lenders.id,
        lenderName: lenders.name,
        lenderStatus: lenders.status,
        ipAllowlist: lenders.ipAllowlist,
        role: lenderUsers.role,
      })
      .from(lenderUsers)
      .innerJoin(lenders, eq(lenderUsers.lenderId, lenders.id))
      .where(eq(lenderUsers.userId, dbUser.id))
      .limit(1);

    if (row) {
      lender = {
        id: row.lenderId,
        name: row.lenderName,
        status: row.lenderStatus,
        role: row.role,
        ipAllowlist: row.ipAllowlist ?? null,
      };
    }
  }

  const actor: Actor = {
    userId: dbUser.id,
    kind: dbUser.kind,
    customerId,
    lenderId: lender?.id ?? null,
    lenderRole: lender?.role ?? null,
    roles: staff?.roles ?? [],
    garageId: staff?.garageId ?? null,
    emailVerified: dbUser.emailVerified,
    phoneNumberVerified: dbUser.phoneNumberVerified,
    mfaVerified: Boolean(dbSession.mfaVerifiedAt),
    stepUpVerifiedAt: dbSession.stepUpVerifiedAt,
    ip: meta.ip,
    userAgent: meta.userAgent,
  };

  return {
    actor,
    sessionId: dbSession.id,
    user: {
      id: dbUser.id,
      name: dbUser.name,
      email: dbUser.email,
      emailVerified: dbUser.emailVerified,
      phoneNumber: dbUser.phoneNumber,
      phoneNumberVerified: dbUser.phoneNumberVerified,
      twoFactorEnabled: dbUser.twoFactorEnabled,
      kind: dbUser.kind,
      status: dbUser.status,
      locale: dbUser.locale,
    },
    lender,
    staff,
  };
}

export interface GuardMode {
  mode?: "redirect" | "throw";
  nextPath?: string;
}

export async function requireUser(options: GuardMode = {}): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) {
    if (options.mode === "throw") {
      throw new DomainError("UNAUTHENTICATED", "Sign in to continue.", 401);
    }
    const next = safeNext(options.nextPath, "/account");
    redirect(`/sign-in?next=${encodeURIComponent(next)}`);
  }
  return ctx;
}

export async function requireCustomer(
  options: { verified: boolean } & GuardMode = { verified: true },
): Promise<SessionContext> {
  const ctx = await requireUser(options);
  if (ctx.user.kind !== "customer") {
    if (options.mode === "throw") {
      throw new DomainError("FORBIDDEN", "Customer account required.", 403);
    }
    redirect("/");
  }

  if (options.verified && !ctx.user.emailVerified && !ctx.user.phoneNumberVerified) {
    if (options.mode === "throw") {
      throw new DomainError(
        "EMAIL_UNVERIFIED",
        "Verify your email or phone number before continuing.",
        403,
      );
    }
    const next = safeNext(options.nextPath, "/apply");
    redirect(`/verify?next=${encodeURIComponent(next)}`);
  }

  return ctx;
}

export async function requireStaff(
  allowedRoles: StaffRole[],
  options: GuardMode = {},
): Promise<SessionContext> {
  const ctx = await requireUser(options);
  if (ctx.user.kind !== "staff" || !ctx.staff?.active) {
    if (options.mode === "throw") {
      throw new DomainError("FORBIDDEN", "Staff access required.", 403);
    }
    redirect("/sign-in");
  }

  if (!ctx.user.twoFactorEnabled) {
    if (options.mode === "throw") {
      throw new DomainError("MFA_REQUIRED", "Enrol two-factor authentication before continuing.", 403);
    }
    redirect("/mfa/setup");
  }

  if (!ctx.actor.mfaVerified) {
    if (options.mode === "throw") {
      throw new DomainError("MFA_REQUIRED", "Complete two-factor verification to continue.", 403);
    }
    redirect(`/mfa?next=${encodeURIComponent(safeNext(options.nextPath, "/admin"))}`);
  }

  const hasRole = allowedRoles.length === 0 || ctx.staff.roles.some((r) => allowedRoles.includes(r));
  if (!hasRole) {
    if (options.mode === "throw") {
      throw new DomainError("FORBIDDEN", "Your role does not permit this action.", 403);
    }
    redirect("/admin");
  }

  return ctx;
}

export async function requireLender(
  role?: LenderRole,
  options: GuardMode = {},
): Promise<SessionContext> {
  const ctx = await requireUser(options);
  if (ctx.user.kind !== "lender" || !ctx.lender || ctx.lender.status !== "active") {
    if (options.mode === "throw") {
      throw new DomainError("FORBIDDEN", "Active lender account required.", 403);
    }
    redirect("/sign-in");
  }

  if (!isIpInAllowlist(ctx.actor.ip, ctx.lender.ipAllowlist)) {
    if (options.mode === "throw") {
      throw new DomainError("IP_NOT_ALLOWED", "Access from this IP address is not permitted.", 403);
    }
    redirect("/sign-in?error=ip_not_allowed");
  }

  if (!ctx.user.twoFactorEnabled) {
    if (options.mode === "throw") {
      throw new DomainError("MFA_REQUIRED", "Enrol two-factor authentication before continuing.", 403);
    }
    redirect("/mfa/setup");
  }

  if (!ctx.actor.mfaVerified) {
    if (options.mode === "throw") {
      throw new DomainError("MFA_REQUIRED", "Complete two-factor verification to continue.", 403);
    }
    redirect(`/mfa?next=${encodeURIComponent(safeNext(options.nextPath, "/lender"))}`);
  }

  if (role && ctx.lender.role !== role) {
    if (options.mode === "throw") {
      throw new DomainError("FORBIDDEN", "Lender approver permission required.", 403);
    }
    redirect("/lender");
  }

  return ctx;
}

export async function requireRecentAuth(minutes = 10): Promise<SessionContext> {
  const ctx = await requireUser({ mode: "throw" });
  const verifiedAt = ctx.actor.stepUpVerifiedAt;
  const maxAgeMs = minutes * MS_MINUTE;
  if (!verifiedAt || Date.now() - verifiedAt.getTime() > maxAgeMs) {
    throw new DomainError(
      "STEP_UP_REQUIRED",
      "Re-enter your password or authenticator code to confirm this sensitive action.",
      403,
    );
  }
  return ctx;
}
