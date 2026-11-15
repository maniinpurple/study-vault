@AGENTS.md

# VaultLearn — Architecture & Working Rules

VaultLearn is a production-grade EdTech SaaS for students (primarily Vietnamese high-school / university
STEM) that turns **wrong exam answers into a spaced-repetition "Problem Vault"**, backed by a
bring-your-own-key (BYOK) AI layer. Read this file and [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) (tokens, motion, copy rules) fully before making changes.

---

## 1. Tech stack (do not swap without discussion)

| Concern | Choice |
|---|---|
| Framework | **Next.js App Router**, TypeScript `strict`, React Server Components by default |
| Styling | **Tailwind CSS v4** (CSS-first config in `src/app/globals.css`), **shadcn/ui** (`src/components/ui`) |
| Motion / icons | **Framer Motion** (`framer-motion`), **Lucide** (`lucide-react`) |
| Math | **KaTeX** (`katex`) — question/solution text is stored as Markdown + LaTeX (`$…$`, `$$…$$`); a question may also be image-only |
| PDF | **PDF.js** (`pdfjs-dist`) — render pages to `<canvas>` client-side for the snip tool; worker loaded from `pdfjs-dist/build/pdf.worker.min.mjs` |
| Database | **PostgreSQL** via **Prisma** (`prisma/schema.prisma`) — the only data store. Files (exam PDFs, crops) live in `stored_files` (bytea) |
| Auth | **Auth.js v5** (`next-auth@beta`), Credentials provider, bcrypt (`bcryptjs`), JWT session cookie |
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
- **Tailwind 4** — no `tailwind.config`; tokens and custom utilities (type roles `text-display` / `text-title` /
  `text-heading` / `text-reading` / `text-caption` / `text-overline`, and `mark-ink`) are declared in `globals.css`.
- **Cache Components + URL data** — `usePathname()` / `params` are runtime data on dynamic routes. The sidebar sits
  behind `<Suspense>` in `app-shell.tsx`, and `/sources/[id]` reads `params` inside `<Suspense>`. Don't read the URL in
  the shell outside a boundary or `next build` fails.
- **zod 4** — use `z.prettifyError`, `z.email()` etc. (v4 APIs).
- npm 11 blocks dependency install scripts by default (`npm install-scripts ls`). Prisma works without its
  postinstall; don't approve scripts without checking with the user.

### Data access & isolation (read before touching data code)
- **Server-only data.** The browser never talks to the database. `src/components/app-provider.tsx` calls the server
  actions in `src/server/actions.ts` (each returns the user's fresh snapshot); files are served by `/api/files/[...path]`
  and uploaded through `/api/sources` (multipart) or `createProblemAction`.
- **Every action** (1) takes the user id from the verified session (`requireUserId()` in `src/server/session.ts`) —
  never from arguments —, (2) validates its arguments with zod (`src/server/schemas.ts`; actions are public endpoints),
  (3) calls `PrismaRepository` (`src/lib/repo/prisma.ts`), whose **every query carries `userId` in its `where`**
  (link tables with no `user_id` are scoped through their card / problem). Ids from the client are UUID-checked first.
- Secrets never leave the server: `passwordHash` and encrypted API keys are excluded from every returned shape
  (`USER_SELECT`, `API_KEY_SELECT`). AI routes receive a **key id**, and `resolveCredential()` loads the signed-in user's own
  active key. `/api/files` looks files up by path **and** user id (404 for anyone else's path).
- The Prisma client (`src/lib/db/prisma.ts`) is lazy: importing it never touches the DB, so `next build` needs none.
  The app uses `DATABASE_URL_POOLED` when set, else `DATABASE_URL`; Prisma Migrate uses `DIRECT_URL` → `DATABASE_URL`.
- Never add a query without `userId` in its `where`. The only cross-user reads are the COUNTS and account identity on
  `/admin` (`src/server/admin.ts`) — never anyone's study content.

### Auth, roles, admin
- `src/auth.config.ts` (edge-safe) + `src/auth.ts` (Credentials + bcrypt). `src/proxy.ts` redirects signed-out visitors to
  `/login` (pages only; `/api` routes and server actions authenticate themselves). `/login` and `/register` are in the
  `(auth)` route group, outside the app shell; registration is `registerAction` in `src/server/auth-actions.ts`.
- `User.role` is `USER` (default) or `ADMIN`. `/admin` calls `requireAdmin()`, which reads the role from the database on
  every request (not the JWT) and redirects non-admins to `/`. Promote an account with SQL, e.g.
  `UPDATE users SET role = 'ADMIN' WHERE email = '…';`.

---

## 2. Design system — appearance (style × mode × accent × layout)

**[`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) is the source of truth** (read §2.5 before touching themes). Summary:

- **Four independent settings, each on its own attribute**: `data-mode` (light | dark; account setting `User.theme`; `THEME_ATTRIBUTE`, the legacy `OBSIDIAN` renders as Dark),
  `data-theme` (style: minimal | doodle | cafe | brutalism | stitch | retro | tetris; localStorage `vl:theme-style`), `data-layout` (sidebar | topbar; `vl:layout`), and the accent
  (`vl:accent`, `vl:accent-vars` → `<style id="vl-accent">`). Pure logic, constants and the pre-hydration `bootScript()` are in `src/lib/appearance.ts`; hooks in `src/components/use-appearance.ts`
  (`useApplyAppearance()` is mounted in `AppShell`); the picker UI is in `settings-view.tsx`.
- **Tokens** are CSS variables in `globals.css` as `#RRGGBB` or `oklch()`, one declaration per line. A style's CSS lives only in `[data-theme="x"]` / `[data-theme="x"][data-mode="y"]` blocks and
  sets only `--variables`. `tests/design-tokens.test.ts` parses the file and enforces WCAG AA for every style × mode and a sweep of accent colours, plus that isolation.
  **Never hard-code colors, radii, border widths or shadows in components**: use the Tailwind tokens (`bg-background`, `bg-card`, `bg-primary`, `bg-accent`, `border-border`, `border-input`,
  `text-muted-foreground`, `text-brand`, …), `rounded-*`, `border-2` and `shadow-*`, which all follow the active style.
- **Roles**: `primary` is the accent **fill** (one primary action per view), never text (use `text-brand`); `brand` is state (focus, links, progress); `mark` (highlighter yellow) is only for snipped regions and the priority flag.
  The accent group (`primary`, `primary-foreground`, `brand`, `brand-hover`, `accent`, `accent-foreground`) is identical in every style and derived for AA (`deriveAccentVars`).
- **Type**: **one** face for every language and style: Inter (Latin + Vietnamese subsets), JetBrains Mono for LaTeX source. No handwriting/display fonts, no font switching by language. Use the type-role
  utilities (`text-display` / `title` / `heading` / `reading` / `caption` / `overline`), sentence case, line-height ≥ 1.25.
- **Icons**: Lucide, stroke from the style (`--icon-stroke`). Only where functional: sidebar destinations, toolbar tools, icon-only buttons (always with an accessible name). No icons in headings, badges, labelled buttons or empty states.
- **No emoji anywhere** in the interface, and one language per string (enforced by `tests/i18n.test.ts`).
- **Motion**: import presets from `src/lib/motion.ts` (`spring.snappy` / `smooth` / `lively`, `fade`); use `layoutId` for moving selection. Buttons lift (`--lift`) and press (`--press`) per style.
  `MotionConfig reducedMotion="user"` is set in the shell.
- **Surfaces**: `<Surface>` (`src/components/crosshair-card.tsx`; `CrosshairCard` is a legacy alias) is the resting card: `--bw` outline, `rounded-lg`, `shadow-xs`.

### Layout
- `AppShell` = collapsible left sidebar (248px ↔ 60px rail, state in `localStorage`) + content, or, with the "Top bar" layout, a sticky horizontal bar (`TopNavBody`) with the same destinations, a subject menu
  and the footer controls. Both are rendered and CSS (`[data-layout]`, `.vl-rail` / `.vl-topnav`) shows one, so there is no flash. Under 1024px a slim top bar opens a sheet whatever the setting.
  `--chrome` is the height of the bar above the content (full-height workspaces and sticky headers subtract it). Nothing floats over content. The sidebar's subject list is the **global subject filter**
  (`activeSubjectId`); theme, language and account controls live in its footer.
- Routes: `src/app/(auth)/` (login, register: no shell), `src/app/(app)/` (provider + sidebar shell), and inside it
  `(pages)/` (padded, centered column) and `sources/[id]` (the full-viewport workspace).
- Page pattern: one serif `text-display` title, one sentence of description, primary action top-right; sections are
  separated by a `text-overline` label and a dashed rule.

---

## 3. Language separation (two independent settings — never conflate them)

1. **GUI language** (`User.uiLanguage`, `VI` | `EN`, default `VI`): all interface strings come from
   `src/lib/i18n/dictionaries/{vi,en}.ts`, written to the copy rules and glossary in `DESIGN_SYSTEM.md` §8. **No
   hard-coded user-facing strings in components.** The `VI / EN` switch is in the sidebar footer and in Settings. Base tags have an `i18nKey` so their display names follow the GUI language.
2. **AI output language** (`Language` enum): resolved in this priority order:
   `Subject.aiOutputLanguage` → `UserApiKey.aiOutputLanguage` → `User.defaultAiOutputLanguage`.
   Every AI prompt builder MUST inject an explicit, non-negotiable language directive (system prompt + a final
   reminder line) and the response must be validated/regenerated if it drifts. LaTeX/math is language-neutral.

A user can have a Vietnamese UI and English AI output for an English-medium subject (e.g. IB Physics) — that is the point.

---

## 4. Core modules

### 4.1 Multi-account auth + BYOK API Vault
- One signed-in account per session (Auth.js). The sidebar footer shows that user and a sign-out action; there is no account switcher.
- Providers: `GEMINI`, `OPENAI`, `ANTHROPIC` (Claude), `CUSTOM` (OpenAI-compatible `baseUrl`).
- Keys are encrypted **server-side** with AES-256-GCM (`src/lib/crypto.ts`) using `VAULT_ENCRYPTION_KEY`
  (32 bytes, base64). Ciphertext envelope: `v1.<keyId>.<iv>.<tag>.<ciphertext>` (base64url), AAD binds
  `userId:provider` so ciphertexts cannot be swapped between rows/users.
- **Plaintext keys never reach the browser after entry and are never logged.** Only `keyHint` (last 4) is displayed.
- The plaintext key is sent once to `createApiKeyAction`, encrypted in the repository and stored only as ciphertext; AI
  routes decrypt it in memory per request. The browser never holds the ciphertext.
- Each key carries its own `aiOutputLanguage` and `defaultModel`.

### 4.2 Sources → in-document snipping (`/sources`, `/sources/[id]`)
- **Upload flow**: choosing files opens an upload dialog (`upload-dialog.tsx`) with a title, a subject and **"Tự động điền bằng AI"**
  (the AI classifier skill: page 1 → `{ title, subject }`, matched to the student's subjects by `matchSubject`; an unknown subject can be
  created in one click). **Word (.docx)** is supported by converting in the browser (`docx-source.ts`: mammoth → sanitised HTML →
  A4 pages via `docx-layout.ts` → `html2canvas-pro`), then stored as an ordinary IMAGE source of page JPEGs — so viewer, snipping
  and stitching need no special case and the DB enum is unchanged. Limits: Word equations (OMML) are dropped by mammoth, and the
  original .docx is not kept.
- **Sources library** (`/sources`): upload a PDF or a set of photos → `ExamUpload` (deduplicated by sha256) with its files
  and a page-1 thumbnail (`uploadThumbnailPath`, derived from the id — no column). A source belongs to a subject.
- **Workspace** (`/sources/[id]`): split screen. Left: the document, continuous scroll, pages rendered lazily with PDF.js.
  The **snip tool** is on by default — drag a box over a question. Right: the **snippets tray**.
- A snip is saved **immediately** as a `MistakeCard` (`examUploadId`, `sourcePage`, `cropBox` normalized 0–1 as
  `{ page, x, y, w, h }`, crop stored at `originalCropPath`, `questionLatex = ""`). **Saving never needs an API key.**
  The crop animates from the page into its tray card; the page keeps a highlighter overlay per snip, numbered in reading
  order (`orderSnips`), and clicking an overlay selects its card (and vice versa).
- **Cropping flow**: dragging draws a pending region — nothing is saved yet. A floating toolbar beside the newest region
  offers Save / Delete (it is counter-scaled by the viewer's `--zoom`, so it keeps its size). **Stitching is implicit**: draw a
  second region (any page) while one is pending and the toolbar moves to it and offers "Save stitched problem"; Delete takes back
  the newest region, Esc discards all. The bottom bar is a passive status. Regions are sorted by page/top/left and stacked at
  one width (`src/lib/stitch.ts`, `stitchCanvases`). `cropBox` holds the first region plus `more` (JSON — no schema change);
  `cropRegions(card)` lists them all, and the page shows an overlay on each (keys must include the index: one card can have
  several regions on one page).
- **Viewer zoom/pan** uses `react-zoom-pan-pinch`. Gotchas: `trackPadPanning` is **disabled by default** — it must be enabled for
  two-finger scrolling to pan; `wheel.wheelDisabled` leaves only ctrl+wheel (macOS pinch) zooming; `wheel.step` is multiplied by the
  wheel delta in smooth mode, so it is kept tiny (0.004). These values were tuned by feel on a real trackpad — **do not "calibrate"
  them** (a custom eased zoom engine was tried and rejected). Zoom state is written straight to the DOM (`--zoom`, the % label),
  never to React state. Mouse/touch dragging pans only in the Scroll tool. A "?" popover (`help-tip.tsx`) explains the controls.
- Each tray card keeps **image + error tags + solution + takeaway together** and autosaves (`ProblemFields`).
- "Convert to text" is optional and per card: the vision model (user's key, `/api/ai/ocr`) rewrites the crop into clean
  Markdown+LaTeX without handwritten marks. A problem therefore has text, an image, or both; UI that needs text
  (number variants, the synthesizer) must handle image-only problems.
- Deleting a source removes its files; its problems stay in the vault with `examUploadId = null`.

### 4.2a AI skills (all use the student's own key; prompts in `skills-prompt.ts` / `ocr-prompt.ts`, runners in `ai-jobs.ts`)
- **Classifier** (`/api/ai/classify`): upload dialog. **Reconstruction** (`/api/ai/ocr`, "Tái tạo đề (AI)"): a snippet's image → Markdown/LaTeX,
  shown in an editable box with a live `react-markdown` + `remark-math` + `rehype-katex` preview (`markdown-math.tsx`) so OCR mistakes can be
  fixed by hand; it never overwrites existing text. **Analysis** (`/api/ai/analyze`, `{ type, core_concept }`): the review column's
  "Phân tích dạng toán" card (`problem-analysis.tsx`); it states the problem type and core formula without solving.
- Routes take a **key id** (never a key); `resolveCredential()` loads and decrypts the signed-in user's own key. They work with any
  provider the student configured (Gemini included) because the provider layer is shared.

### 4.2b Problem Vault (`/vault`)
- Every saved problem in one place, each card showing the question (image or formatted math) with its solution and
  takeaway. Standalone problems can be added (text and/or image).
- **Performance**: both lists load progressively (`load-more.tsx`: a visible count that grows by a page when you scroll near the end,
  resetting on any search/sort/filter/view change; page sizes in `lib/vault.ts`). Images use `next/image` via `StoredImage` — lazy by default
  and **`unoptimized` on purpose**: Next's optimizer fetches without the user's session and caches for everyone, so private files are served
  as-is and cached by the browser (`/api/files` sends an immutable private header). Use `fill` + a `relative` parent for thumbnails.
- Three views — Grid, List, Detailed (`problem-views.tsx`) — chosen with the shared `ViewToggle` and remembered per device in
  `localStorage` (`useStoredChoice`, key `vl:vault-view`). The Sources library has the same toggle (`vl:sources-view`).
- `src/lib/vault.ts` (pure, tested) filters (subject, search ignoring diacritics, priority, review status), sorts and
  groups (date, topic, source, error tag, review status); `reviewStatus()` lives in `src/lib/problems.ts`.

### 4.3 FSRS (zero-token, native) + Review Arena (`/review`)
- `src/lib/fsrs.ts` is a dependency-free TypeScript implementation of **FSRS-6** (21 weights). No AI calls.
- Card scheduling fields live on `MistakeCard`; every review appends a `CardAttemptLog` with a sequential
  `attemptNumber` (Attempt 1, 2, 3 … / "Lần 1, 2, 3"), the rating, a free-text note, `timeSpentMs`,
  `variantQuestionLatex` (set when answered on an AI number-variant) and FSRS before/after snapshots.
- **Logic-problem intervals**: grades map to fixed days (`REVIEW_INTERVAL_DAYS` in `review.ts`): Quên 1, Khó 3, Nhớ 7, Dễ 14 — no
  minutes-long learning steps, because a logic problem is only tested once the specific numbers are forgotten. `scheduleReview`
  still runs FSRS to keep stability/difficulty/lapses (used by the weakness ranking and "mastered"), then overrides `due`,
  `scheduledDays` and sets state to REVIEW; `previewIntervals()` returns the same days, so button labels equal the stored result.
  Only cards graded before this change can still be in a (re)learning step.
- Per-user `desiredRetention`, `maximumInterval`, optional custom `fsrsWeights`.
- `src/lib/review.ts` (pure, tested) builds today's queue (local day boundary; (re)learning steps only within a 20-min
  learn-ahead window) and previews/applies grades — the button intervals and the stored result use the same scheduler.
  The review header has a subject dropdown ("Đang ôn tập" + Tất cả môn / each subject with its due count) bound to the same global
  filter as the sidebar; the filter strictly limits the queue, and a pinned card from another subject never survives a change. An image-only question is large and opens a
  centered, blurred-backdrop lightbox (`image-lightbox.tsx`, `react-zoom-pan-pinch`, same zoom settings as the exam viewer). The lightbox
  is a z-60 portal, **not** a native `<dialog>` (top-layer dialogs sit above every z-index and would hide the z-70 Scratchpad).
  Subjects have no exam date in the UI (the DB column is unused). The Overview shows a welcome state, not "done for today", when there are no problems.
  Review shows the question first (clean text + figure, or the crop image for image-only problems); solution, notes,
  attempt log, reflection note and error tags only after "Show answer". "New numbers" (`/api/ai/mutate`, light tier) is
  the only AI call in review and needs question text.

- **Scratchpad** (`src/components/scratchpad.tsx`, `react-rnd` + `react-sketch-canvas`): mounted once in `AppShell`, so it is on every page.
  A round button (bottom-right) opens a Quick-Note-style window: drag by the header, resize from any edge, pen colors black / red /
  yellow highlighter, eraser, undo, clear, and four CSS paper patterns (ivory, dots, lined, grid). The overlay layer is
  `pointer-events-none`, so only the window and button take clicks. Purely temporary — never stored; paper/ink colors are fixed
  (not themed), like exam pages.

### 4.4 "Second Brain" AI memory
- `UserAiPersona` (1:1 user): hidden global learner persona (summary, strengths, weaknesses); `preferences.tagFeedback`
  remembers the user's last 20 declined tag suggestions (see `src/lib/tags.ts`).
- `Subject.memorySummary` + `Subject.memoryInsights` (`overcome`, `blindSpots`, `thinkingPatterns`, `teacherEmphasis`,
  `nextFocus`): rebuilt by the **"Update memory"** button on the subject page
  (`/api/ai/memory-sync`, light tier). The browser sends a capped, ref-labelled digest (`src/lib/brain.ts`: C1…/T1…
  refs, chronological attempts); the server builds the prompt (`src/lib/brain-prompt.ts`), merges with the previous
  memory, refines the persona and may return ≤2 tag suggestions in the same call. Users can inspect/edit both memories.
- `memoryStale` flips true when cards/notes/tags change after the last sync (review, tag edits, promotions…).

### 4.5 Adaptive error tagging
- Four base tags seeded **per subject** (`origin = BASE`, `scopeKey = subjectId`, deterministic id `baseTagId()`):
  `concept_gap`, `misread`, `stuck_approach`, `calculation` ("Hổng kiến thức", "Đọc sai đề", "Bí hướng giải",
  "Tính toán sai"). Per-subject scope keeps an IELTS rename out of TSA Math.
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
  `t.synth.experimentalBadge` ("Do AI tạo · Có thể có sai sót" / "AI-generated · May contain errors"). "Report / fix with AI"
  (`/api/ai/synthesize/fix`) re-verifies against the user's report and bumps `revision` when it corrects the problem.
  Users can also promote a problem to a real `MistakeCard`.

---

## 5. Repository layout

```
prisma/schema.prisma            # single source of truth for the data model
prisma/migrations/              # SQL migrations (generated by `prisma migrate diff/dev`, committed)
src/app/                        # App Router: (auth)/ sign-in pages, (app)/(pages)/ padded pages, (app)/sources/[id] workspace, api/
DESIGN_SYSTEM.md                # tokens, type, motion, layout and copy rules (read before UI work)
src/components/ui/              # shadcn/ui primitives (generated — edit sparingly)
src/components/                 # app components
src/lib/fsrs.ts                 # FSRS-6 engine (pure, tested)
src/lib/crypto.ts               # AES-256-GCM vault (server-only, tested)
src/lib/env.ts                  # env validation (database URLs, secrets)
src/lib/db/prisma.ts            # lazy Prisma client singleton
src/lib/constants.ts            # base tags, enums mirrored for the client, AI-language resolver
src/lib/i18n/                   # GUI dictionaries (vi.ts is the source-of-truth shape)
src/lib/utils.ts                # cn() etc.
src/lib/repo/                   # Repository contract (types.ts) + PostgreSQL implementation (prisma.ts)
src/server/                     # server actions, zod schemas, session guards, admin queries, auth actions
src/auth.ts, auth.config.ts, proxy.ts  # Auth.js config, edge-safe config, route gatekeeper
src/lib/review.ts               # review queue + FSRS grading helpers (pure)
src/lib/brain.ts, brain-prompt.ts  # Second Brain digest + memory-sync / tag-suggest prompt contracts (pure)
src/lib/synth-prompt.ts, lab.ts # mutate / synthesize / fix prompt contracts; exam scope + source selection (pure)
src/lib/tags.ts                 # tag display names, decline-feedback memory (pure)
src/lib/problems.ts, vault.ts   # snip ordering, save rules, review status; vault filter/sort/group (pure)
src/lib/motion.ts, color.ts     # spring presets; OKLCH → sRGB + WCAG contrast (pure, tested)
src/lib/ai-jobs.ts              # server-only runners for the structured AI routes (prompt built server-side)
src/lib/ai-client.ts            # browser → /api/ai/* with zod-validated responses
src/components/crosshair-card.tsx  # <Surface>, the standard resting card
src/components/app-shell.tsx    # collapsible sidebar shell
src/components/sources/, vault/, problems/  # snipping workspace, Problem Vault, shared problem fields
src/components/experimental-badge.tsx  # mandatory badge for AI-generated problems/variants
tests/                          # vitest unit tests (db.integration.test.ts runs only with TEST_DATABASE_URL)
```

## 6. Coding rules
- TypeScript strict; no `any` (use `unknown` + zod). Shared enums come from Prisma-generated types on the server and
  mirrored string unions in `src/lib/constants.ts` for client code (keep them in sync).
- Server-only modules (`crypto.ts`, Prisma, AI provider calls) import `"server-only"`.
- All user-scoped queries filter by `userId` — no exceptions (see "Data access & isolation").
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
