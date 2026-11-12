import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { getDataMode, getServerEnv } from "@/lib/env";

type Client = InstanceType<typeof PrismaClient>;

const globalForPrisma = globalThis as unknown as { __vaultlearnPrisma?: Client };

/**
 * Lazily constructed Prisma client (singleton across dev hot reloads).
 * Importing this module never touches the database; calling `getPrisma()` in local mode throws a clear error.
 */
export function getPrisma(): Client {
  if (globalForPrisma.__vaultlearnPrisma) return globalForPrisma.__vaultlearnPrisma;

  const env = getServerEnv();
  if (getDataMode(env) !== "remote" || !env.DATABASE_URL) {
    throw new Error("Prisma is unavailable in local data mode — set DATABASE_URL to enable the Postgres backend.");
  }

  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  if (env.NODE_ENV !== "production") globalForPrisma.__vaultlearnPrisma = client;
  return client;
}
