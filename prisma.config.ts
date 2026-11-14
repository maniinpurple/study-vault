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
    // Migrations need a direct (non-pooled) connection: DIRECT_URL when set, otherwise DATABASE_URL.
    // The app itself prefers DATABASE_URL_POOLED (see src/lib/env.ts).
    url: process.env["DIRECT_URL"] || process.env["DATABASE_URL"],
  },
});
