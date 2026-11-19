import type { DbOrTx } from "@/server/db/client";
import type { Actor } from "@/server/db/rls";
import { auditLog, authEvents } from "@/server/db/schema";

export interface AuditInput {
  db: DbOrTx;
  actor: Actor;
  action: string;
  entityType: string;
  entityId: string;
  meta?: Record<string, unknown>;
}

export async function audit(input: AuditInput): Promise<void> {
  await input.db.insert(auditLog).values({
    actorUserId: input.actor.userId,
    actorType: input.actor.kind,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    ip: input.actor.ip ?? null,
    userAgent: input.actor.userAgent ?? null,
    meta: input.meta ?? {},
  });
}

export type AuthEventType = (typeof authEvents.$inferInsert)["type"];

export interface AuthEventInput {
  db: DbOrTx;
  userId?: string | null;
  type: AuthEventType;
  identifierHash?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown>;
}

export async function recordAuthEvent(input: AuthEventInput): Promise<void> {
  await input.db.insert(authEvents).values({
    userId: input.userId ?? null,
    type: input.type,
    identifierHash: input.identifierHash ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    meta: input.meta ?? {},
  });
}
