import "server-only";

import { z } from "zod";

/** Server environment, validated once. See `.env.example` for what each variable does. */
const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Postgres URL. Used by the app when no pooled URL is set, and by Prisma Migrate when DIRECT_URL is not set. */
  DATABASE_URL: optionalString,
  /** Pooled Postgres URL (PgBouncer / Neon pooler). Preferred by the app at runtime. */
  DATABASE_URL_POOLED: optionalString,
  /** Direct Postgres URL for Prisma Migrate, when DATABASE_URL itself is pooled. */
  DIRECT_URL: optionalString,
  /** Auth.js signing secret for session cookies. */
  AUTH_SECRET: optionalString,
  VAULT_ENCRYPTION_KEY: optionalString,
  VAULT_ENCRYPTION_KEYS_PREVIOUS: optionalString,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  }
  cached = parsed.data;
  return cached;
}

/** Connection string the running app uses: the pooled URL when there is one, otherwise DATABASE_URL. */
export function databaseUrl(env: ServerEnv = getServerEnv()): string | undefined {
  return env.DATABASE_URL_POOLED ?? env.DATABASE_URL;
}
