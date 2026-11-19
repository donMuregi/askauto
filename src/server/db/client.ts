import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

type GlobalWithDb = typeof globalThis & {
  __fnplSql?: ReturnType<typeof postgres>;
  __fnplDb?: ReturnType<typeof drizzle<typeof schema>>;
};

const globalForDb = globalThis as GlobalWithDb;

export function getSql() {
  if (!globalForDb.__fnplSql) {
    const env = getEnv();
    globalForDb.__fnplSql = postgres(env.DATABASE_URL, {
      max: env.NODE_ENV === "production" ? 10 : 5,
      prepare: false,
    });
  }
  return globalForDb.__fnplSql;
}

export function getDb() {
  if (!globalForDb.__fnplDb) {
    globalForDb.__fnplDb = drizzle(getSql(), { schema });
  }
  return globalForDb.__fnplDb;
}

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop, receiver) {
    const instance = getDb();
    return Reflect.get(instance, prop, receiver);
  },
});

export type Db = ReturnType<typeof getDb>;
export type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | DbTransaction;
