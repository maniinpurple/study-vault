# VaultLearn

Turn every wrong exam answer into a spaced-repetition "mistake vault", with a bring-your-own-key AI layer.

Architecture, design system and working rules live in [CLAUDE.md](CLAUDE.md).

## Quick start

```bash
npm install
cp .env.example .env.local   # then: npm run vault:keygen → paste into VAULT_ENCRYPTION_KEY
npm run dev
```

With no `DATABASE_URL`, the app runs in **local mode** (IndexedDB in the browser) and needs no other setup.
Set `DATABASE_URL` (+ `DIRECT_URL` on Supabase) and run `npm run db:deploy` to use Postgres.
On Supabase, also run `supabase/rls.sql` once for defense-in-depth RLS.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run check` | typecheck + lint + unit tests |
| `npm run db:migrate` | create/apply a migration in development |
| `npm run db:deploy` | apply committed migrations (CI/production) |
| `npm run vault:keygen` | generate a 32-byte AES-256-GCM master key |
