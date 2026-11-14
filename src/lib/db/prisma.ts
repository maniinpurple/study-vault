import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { databaseUrl, getServerEnv } from "@/lib/env";

export type Db = InstanceType<typeof PrismaClient>;

const globalForPrisma = globalThis as unknown as { __vaultlearnPrisma?: Db };

/**
 * Lazily constructed Prisma client (singleton across dev hot reloads). Importing this module never touches the
 * database, so `next build` works without one; the first query needs DATABASE_URL (or DATABASE_URL_POOLED).
 */
export function getPrisma(): Db {
  if (globalForPrisma.__vaultlearnPrisma) return globalForPrisma.__vaultlearnPrisma;

  const env = getServerEnv();
  const url = databaseUrl(env);
  if (!url) throw new Error("No database configured: set DATABASE_URL (or DATABASE_URL_POOLED) to a PostgreSQL connection string.");

  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: url }),
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
    // Hosted Postgres adds a network round trip per statement; give interactive transactions room.
    transactionOptions: { maxWait: 10_000, timeout: 20_000 },
  });

  if (env.NODE_ENV !== "production") globalForPrisma.__vaultlearnPrisma = client;
  return client;
}
