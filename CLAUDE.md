@AGENTS.md

# VaultLearn — Architecture & Working Rules

VaultLearn is a production-grade EdTech SaaS for students (primarily Vietnamese high-school / university
STEM) that turns **wrong exam answers into a spaced-repetition "mistake vault"**, backed by a
bring-your-own-key (BYOK) AI layer. Read this file fully before making changes.

---

## 1. Tech stack (do not swap without discussion)

| Concern | Choice |
|---|---|
| Framework | **Next.js App Router**, TypeScript `strict`, React Server Components by default |
| Styling | **Tailwind CSS v4** (CSS-first config in `src/app/globals.css`), **shadcn/ui** (`src/components/ui`) |
| Motion / icons | **Framer Motion** (`framer-motion`), **Lucide** (`lucide-react`) |
| Math | **KaTeX** (`katex`) — all question/solution content is stored as Markdown + LaTeX (`$…$`, `$$…$$`) |
| PDF | **PDF.js** (`pdfjs-dist`) — render pages to `<canvas>` client-side for the crop tool; worker loaded from `pdfjs-dist/build/pdf.worker.min.mjs` |
| DB (remote) | **PostgreSQL** via **Prisma** (`prisma/schema.prisma`); deployable on **Supabase** (Postgres + Auth + Storage) |
| DB (local) | **IndexedDB** (structured data, blobs) + **localStorage** (small prefs) fallback so the app runs with zero setup |
| Validation | `zod` at every trust boundary (route handlers, server actions, AI JSON output) |
| Tests | `vitest` (`npm test`) — pure logic in `src/lib/**` must have unit tests |

Package manager: **npm**. Path alias: `@/*` → `src/*`.

### Version-specific gotchas (verified at setup, Nov 2026)
- **Next.js 16.4** — read `node_modules/next/dist/docs/` before using an unfamiliar API. Middleware is now
  **`src/proxy.ts`** (not `middleware.ts`). `cacheComponents` is ON in `next.config.ts`: uncached dynamic data must sit
  under `<Suspense>`; use `"use cache"` for cacheable data. Route/layout props use the global `PageProps<"/path">` /
  `LayoutProps<"/path">` helpers.
- **Prisma 7.10.1 (pinned)** — `prisma@latest` on npm currently points at an 8.0 RC; keep `prisma`, `@prisma/client` and
  `@prisma/adapter-pg` on the same stable version. Datasource URL lives in **`prisma.config.ts`** (not the schema) and
  env files are loaded there explicitly. The client is generated to `src/generated/prisma` (git-ignored, rebuilt by
  `postinstall`) and imported from **`@/generated/prisma/client`** (`@/generated/prisma/enums` for enums). Prisma 7
  requires a driver adapter (`PrismaPg`) — see `src/lib/db/prisma.ts`.
- **shadcn 4 (`base-nova` style)** — primitives are built on **Base UI (`@base-ui/react`)**, not Radix. The CLI now
  generates `import { cn } from "cn"`; this repo uses `clsx` + `tailwind-merge` instead, so after every
  `npx shadcn add …` rewrite that import to `from "@/lib/utils"`.
- **Tailwind 4** — no `tailwind.config`; tokens and custom utilities (`glass-card`, `bg-grid`, `crosshair-mark`,
  `text-glow-gradient`) are declared in `globals.css`.
- **zod 4** — use `z.prettifyError`, `z.email()` etc. (v4 APIs).
- npm 11 blocks dependency install scripts by default (`npm install-scripts ls`). Prisma works without its
  postinstall; don't approve scripts without checking with the user.

### Data modes
`src/lib/env.ts` resolves `DATA_MODE`:
- `remote` — `DATABASE_URL` is set → Prisma/Postgres is the source of truth. Multi-account lives in the `User` table.
- `local` — no `DATABASE_URL` → all user data lives in IndexedDB, namespaced **per local account id** (multi-account
  on one device). The UI must work identically in both modes; code against the repository interfaces, never
  call Prisma or IndexedDB directly from components.
- The Prisma client (`src/lib/db/prisma.ts`) is created lazily; importing it must never crash when `DATABASE_URL` is absent.
- IndexedDB object stores mirror Prisma model names and field names 1:1 so data can be exported/imported to the cloud later.

---

## 2. Design system — "Evervault" dark aesthetic

Three themes, switched via `data-theme` on `<html>` (`obsidian` default, `dark-gray`, `light`). All colors are CSS
variables in `globals.css`; **never hard-code hex values in components** — use the Tailwind tokens
(`bg-background`, `bg-card`, `border-border`, `text-muted-foreground`, `bg-primary`, …).

**Obsidian (default):**
- Background `#030014`.
- Cards: `rgba(15, 14, 23, 0.75)` + `backdrop-blur-md` + `1px solid rgba(255,255,255,0.08)` border.
- `+` crosshair markers at card corners (use the shared `<CrosshairCard>` / `.crosshair` utility, don't re-implement).
- Electric indigo → purple radial glows: `#6366F1` → `#A855F7` (`--glow-from`, `--glow-to`); primary accent = indigo.
- Subtle grid / noise backgrounds are fine; keep contrast ≥ WCAG AA for text.

**Dark Gray:** neutral zinc-based dark (`#0f0f11`-ish), same glow accents, less saturation.
**Light:** white/zinc-50 surfaces, indigo accent, glows reduced to soft tints, borders `rgba(0,0,0,0.08)`.

Motion: Framer Motion for entrance/hover/layout transitions; keep durations 150–300 ms; respect `prefers-reduced-motion`.

---

## 3. Language separation (two independent settings — never conflate them)

1. **GUI language** (`User.uiLanguage`, `VI` | `EN`, default `VI`): all interface strings come from
   `src/lib/i18n/dictionaries/{vi,en}.ts`. **No hard-coded user-facing strings in components.** Toggle is a `VI / EN`
   switch in the header. Base tags have an `i18nKey` so their display names follow the GUI language.
2. **AI output language** (`Language` enum): resolved in this priority order:
   `Subject.aiOutputLanguage` → `UserApiKey.aiOutputLanguage` → `User.defaultAiOutputLanguage`.
   Every AI prompt builder MUST inject an explicit, non-negotiable language directive (system prompt + a final
   reminder line) and the response must be validated/regenerated if it drifts. LaTeX/math is language-neutral.

A user can have a Vietnamese UI and English AI output for an English-medium subject (e.g. IB Physics) — that is the point.

---

## 4. Core modules

### 4.1 Multi-account auth + BYOK API Vault
- Remote: Supabase Auth (`User.id` = `auth.users.id` uuid). Local: local profiles in IndexedDB; switcher in the header.
- Providers: `GEMINI`, `OPENAI`, `ANTHROPIC` (Claude), `CUSTOM` (OpenAI-compatible `baseUrl`).
- Keys are encrypted **server-side** with AES-256-GCM (`src/lib/crypto.ts`) using `VAULT_ENCRYPTION_KEY`
  (32 bytes, base64). Ciphertext envelope: `v1.<keyId>.<iv>.<tag>.<ciphertext>` (base64url), AAD binds
  `userId:provider` so ciphertexts cannot be swapped between rows/users.
- **Plaintext keys never reach the browser after entry and are never logged.** Only `keyHint` (last 4) is displayed.
- Local mode: the browser stores only the ciphertext (encrypted by a server route); AI calls send ciphertext to a
  server route that decrypts in memory and proxies the provider call.
- Each key carries its own `aiOutputLanguage` and `defaultModel`.

### 4.2 Multi-bounding-box Exam Scanner
- Upload PDF or image → `ExamUpload`. PDF pages rendered with PDF.js to canvas.
- User draws **multiple crop boxes** (one per wrong question) and optionally a **sub-box** inside each to preserve a
  geometry figure / graph as an image. Boxes are stored **normalized (0–1) relative to the page**: `{ page, x, y, w, h }`.
- AI OCR (vision model via the user's key) rewrites the crop into clean Markdown+LaTeX, **removing handwritten marks,
  circles, ticks and crossings**; the figure sub-box is kept as `diagramImageUrl`; the raw crop as `originalCropUrl`.
- Result becomes a `MistakeCard` (`ocrStatus` tracks the pipeline). User reviews/edits before saving.

### 4.3 FSRS (zero-token, native) + Review Arena (`/review`)
- `src/lib/fsrs.ts` is a dependency-free TypeScript implementation of **FSRS-6** (21 weights). No AI calls.
- Card scheduling fields live on `MistakeCard`; every review appends a `CardAttemptLog` with a sequential
  `attemptNumber` (Attempt 1, 2, 3 … / "Lần 1, 2, 3"), the rating, a free-text note, `timeSpentMs`,
  `variantQuestionLatex` (set when answered on an AI number-variant) and FSRS before/after snapshots.
- Per-user `desiredRetention`, `maximumInterval`, optional custom `fsrsWeights`.
- `src/lib/review.ts` (pure, tested) builds today's queue (local day boundary; (re)learning steps only within a 20-min
  learn-ahead window) and previews/applies grades — the button intervals and the stored result use the same scheduler.
  The arena shows the clean question (+ figure) first; solution, notes, attempt log, reflection note and error tags only
  after Reveal. "⚡ AI Đổi số liệu" (`/api/ai/mutate`, light tier) is the only AI call in the arena.

### 4.4 "Second Brain" AI memory
- `UserAiPersona` (1:1 user): hidden global learner persona (summary, strengths, weaknesses); `preferences.tagFeedback`
  remembers the user's last 20 declined tag suggestions (see `src/lib/tags.ts`).
- `Subject.memorySummary` + `Subject.memoryInsights` (`overcome`, `blindSpots`, `thinkingPatterns`, `teacherEmphasis`,
  `nextFocus`): rebuilt by the **"🧠 Cập nhật nhận thức AI (Re-sync AI Memory)"** button on the subject page
  (`/api/ai/memory-sync`, light tier). The browser sends a capped, ref-labelled digest (`src/lib/brain.ts`: C1…/T1…
  refs, chronological attempts); the server builds the prompt (`src/lib/brain-prompt.ts`), merges with the previous
  memory, refines the persona and may return ≤2 tag suggestions in the same call. Users can inspect/edit both memories.
- `memoryStale` flips true when cards/notes/tags change after the last sync (review, tag edits, promotions…).

### 4.5 Adaptive error tagging
- Four base tags seeded **per subject** (`origin = BASE`, `scopeKey = subjectId`, deterministic id `baseTagId()`):
  `concept_gap`, `misread`, `stuck_approach`, `calculation` ("Hổng kiến thức nền", "Đọc lướt / Bẫy đề",
  "Tắc hướng biến đổi", "Sai tính toán / Thao tác"). Per-subject scope keeps an IELTS rename out of TSA Math.
  The retired `careless` tag folds into `calculation` (IndexedDB v4 migration).
- AI proposes **CREATE / RENAME** suggestions (`TagSuggestionFeedback`, ≤3 pending per subject; MERGE exists in the
  schema but is not generated). Accept → CREATE makes an `AI_ACCEPTED` tag linked to its evidence cards; RENAME pins the
  new name by clearing `i18nKey`. Decline → reason (`too_specific` | `not_my_intent` | `other: <text>`) is stored and
  remembered in the persona; `tagFeedbackDirectives()` turns it into prompt rules. Declined names are never re-proposed.

### 4.6 Scoped Exam Prep + AI Problem Synthesizer (`/lab`)
- `ExamPrepSession` stores a named scope (subject, chapter/topic ids — a chapter covers its children —, tags,
  high-yield only). `src/lib/lab.ts` filters the scope, ranks weak cards and picks MIX sources (high-yield first,
  distinct topics).
- Synthesizer (`/api/ai/synthesize`, heavy tier) **clones** one or **mixes 2–3** wrong questions into
  `AiSynthesizedProblem`, injecting the subject memory (summary + blind spots + next focus) and persona. Prompts in
  `src/lib/synth-prompt.ts` require an internal step-by-step solve + independent check; replies whose
  `verification.passed` is false are rejected and retried (`UNVERIFIED`). The check is stored as `verificationLatex`.
- Problem statements keep the source question's language; solutions/explanations use the AI output language
  (`languageMode: "source"` in `ai-prompt.ts`).
- Every synthesized problem is `isExperimental = true` and MUST render `<ExperimentalBadge>` with
  `t.synth.experimentalBadge` ("⚠️ Đề AI Thử Nghiệm (Có thể sai số) — Experimental AI Problem"). "Report / fix with AI"
  (`/api/ai/synthesize/fix`) re-verifies against the user's report and bumps `revision` when it corrects the problem.
  Users can also promote a problem to a real `MistakeCard`.

---

## 5. Repository layout

```
prisma/schema.prisma            # single source of truth for the data model
prisma/migrations/              # SQL migrations (generated by `prisma migrate diff/dev`, committed)
supabase/rls.sql                # optional defense-in-depth RLS for Supabase deployments
src/app/                        # App Router routes (RSC by default; "use client" only where needed)
src/components/ui/              # shadcn/ui primitives (generated — edit sparingly)
src/components/                 # app components
src/lib/fsrs.ts                 # FSRS-6 engine (pure, tested)
src/lib/crypto.ts               # AES-256-GCM vault (server-only, tested)
src/lib/env.ts                  # env + data-mode resolution
src/lib/db/prisma.ts            # lazy Prisma client singleton
src/lib/constants.ts            # base tags, enums mirrored for the client, AI-language resolver
src/lib/i18n/                   # GUI dictionaries (vi.ts is the source-of-truth shape)
src/lib/utils.ts                # cn() etc.
src/lib/repo/                   # Repository contract (types.ts) + IndexedDB implementation (local.ts) + demo seed
src/lib/review.ts               # review queue + FSRS grading helpers (pure)
src/lib/brain.ts, brain-prompt.ts  # Second Brain digest + memory-sync / tag-suggest prompt contracts (pure)
src/lib/synth-prompt.ts, lab.ts # mutate / synthesize / fix prompt contracts; exam scope + source selection (pure)
src/lib/tags.ts                 # tag display names, decline-feedback memory (pure)
src/lib/ai-jobs.ts              # server-only runners for the structured AI routes (prompt built server-side)
src/lib/ai-client.ts            # browser → /api/ai/* with zod-validated responses
src/components/crosshair-card.tsx  # the standard Evervault card surface
src/components/experimental-badge.tsx  # mandatory badge for AI-generated problems/variants
tests/                          # vitest unit tests (+ local-repo.test.ts on fake-indexeddb, db.integration.test.ts opt-in)
```

## 6. Coding rules
- TypeScript strict; no `any` (use `unknown` + zod). Shared enums come from Prisma-generated types on the server and
  mirrored string unions in `src/lib/constants.ts` for client code (keep them in sync).
- Server-only modules (`crypto.ts`, Prisma, AI provider calls) import `"server-only"`.
- All user-scoped queries filter by `userId` — no exceptions (also enforced by `supabase/rls.sql` in Supabase).
- Dates are stored UTC; FSRS day boundaries are computed in UTC unless a user timezone is passed.
- AI responses that feed the DB must be requested as JSON and parsed with zod; never trust model output.
- New AI features: put the prompt + schemas in a pure `*-prompt.ts`, run it from `ai-jobs.ts` via `aiJobHandler`
  (the browser sends structured data, never a prompt), and call it through `ai-client.ts`.
- `<Modal>` is a native `<dialog>`: React `autoFocus` is overridden by `showModal()`; mark the field `data-autofocus`.
- Keep `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` green before finishing any task.
- Schema changes: edit `schema.prisma` → `npx prisma migrate dev --name <change>` (with a DB) or
  `npx prisma migrate diff` to author SQL without one. Never hand-edit an applied migration.

## 7. Commands
```
npm run dev          # start dev server
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # vitest run
npm run check        # typecheck + lint + test
npm run db:generate  # prisma generate
npm run db:migrate   # prisma migrate dev
npm run vault:keygen # print a fresh VAULT_ENCRYPTION_KEY
```

DB integration test (disposable Postgres only — it creates and deletes rows):
```
npx prisma dev -n vaultlearn-test -d     # prints a postgres:// URL
DATABASE_URL=<url> npx prisma migrate deploy
TEST_DATABASE_URL=<url> npx vitest run tests/db.integration.test.ts
npx prisma dev rm vaultlearn-test
```
