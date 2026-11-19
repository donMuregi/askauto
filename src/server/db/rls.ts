import { sql } from "drizzle-orm";
import { getDb, type DbTransaction } from "./client";

export type UserKind = "customer" | "staff" | "lender" | "system";
export type StaffRole =
  | "admin"
  | "ops_reviewer"
  | "ops_approver"
  | "assessor"
  | "garage"
  | "accounts";
export type LenderRole = "approver" | "viewer";

export interface Actor {
  userId: string | null;
  kind: UserKind;
  customerId?: string | null;
  lenderId?: string | null;
  lenderRole?: LenderRole | null;
  roles: StaffRole[];
  garageId?: string | null;
  emailVerified?: boolean;
  phoneNumberVerified?: boolean;
  mfaVerified?: boolean;
  stepUpVerifiedAt?: Date | null;
  ip?: string | null;
  userAgent?: string | null;
}

export const SYSTEM_ACTOR: Actor = {
  userId: null,
  kind: "system",
  roles: [],
};

export interface DomainContext {
  actor: Actor;
  db: DbTransaction;
}

export async function withActor<T>(
  actor: Actor,
  fn: (ctx: DomainContext) => Promise<T>,
): Promise<T> {
  const database = getDb();
  return database.transaction(async (tx) => {
    const rolesValue = actor.roles.join(",");
    await tx.execute(
      sql`SELECT
        set_config('app.user_id', ${actor.userId ?? ""}, true),
        set_config('app.kind', ${actor.kind}, true),
        set_config('app.customer_id', ${actor.customerId ?? ""}, true),
        set_config('app.lender_id', ${actor.lenderId ?? ""}, true),
        set_config('app.roles', ${rolesValue}, true)`,
    );
    return fn({ actor, db: tx });
  });
}
