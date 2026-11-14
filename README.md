# VaultLearn

Turn every wrong exam answer into a spaced-repetition "mistake vault", with a bring-your-own-key AI layer.

Architecture, design system and working rules live in [CLAUDE.md](CLAUDE.md).

## Quick start

```bash
npm install
cp .env.example .env.local   # then: npm run vault:keygen → paste into VAULT_ENCRYPTION_KEY
npm run dev
```

You need a PostgreSQL database: set `DATABASE_URL` (and `DATABASE_URL_POOLED` on a pooled host), `AUTH_SECRET` and
`VAULT_ENCRYPTION_KEY` in `.env.local`, then run `npm run db:deploy` to apply the migrations.
Create an account at `/register`. To make an account an admin (unlocks `/admin`):
`UPDATE users SET role = 'ADMIN' WHERE email = 'you@example.com';`

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run check` | typecheck + lint + unit tests |
| `npm run db:migrate` | create/apply a migration in development |
| `npm run db:deploy` | apply committed migrations (CI/production) |
| `npm run vault:keygen` | generate a 32-byte AES-256-GCM master key |
