import "server-only";

import { z } from "zod";

/**
 * Server environment, validated once. Everything is optional so the app boots with zero configuration
 * (local IndexedDB mode); features light up as variables are provided.
 */
const optionalString = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Pooled Postgres URL used by the app (Supabase: the pgBouncer/Supavisor URL). */
  DATABASE_URL: optionalString,
  /** Direct Postgres URL used by Prisma Migrate (Supabase: port 5432). */
  DIRECT_URL: optionalString,
  /** Force a data mode; otherwise inferred from DATABASE_URL. */
  DATA_MODE: z.enum(["local", "remote"]).optional(),
  VAULT_ENCRYPTION_KEY: optionalString,
  VAULT_ENCRYPTION_KEYS_PREVIOUS: optionalString,
  NEXT_PUBLIC_SUPABASE_URL: optionalString,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type DataMode = "local" | "remote";

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

/** `remote` when a Postgres URL is configured (or forced), otherwise `local` (IndexedDB in the browser). */
export function getDataMode(env: ServerEnv = getServerEnv()): DataMode {
  if (env.DATA_MODE) return env.DATA_MODE;
  return env.DATABASE_URL ? "remote" : "local";
}

export function isSupabaseConfigured(env: ServerEnv = getServerEnv()): boolean {
  return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
