import { config as loadEnv } from "dotenv";
import { defineConfig } from "prisma/config";

// Prisma 7 no longer auto-loads env files. Mirror Next.js precedence: .env.local wins over .env.
loadEnv({ path: [".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Pooled (pgBouncer) URL is used by the app; migrations need a direct connection on Supabase.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
