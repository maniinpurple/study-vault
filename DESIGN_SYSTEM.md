# VaultLearn — Design & Copywriting System

The source of truth for how VaultLearn looks, moves and speaks. Tokens live in `src/app/globals.css`;
`tests/design-tokens.test.ts` parses that file and fails when a token pair of **any style, in either mode, or any accent colour** stops meeting
WCAG 2.2 AA. Read this before UI work.

The look is a three-part, per-device **appearance** you can change in Settings (§2.5): a *style* (Minimal, Doodle, Cafe, Brutalism, Stitch,
Retro, Tetris), an *accent colour*, and a *layout* (sidebar or top bar), on top of the account's light / dark *mode*.

---

## 1. Context and goals

**Who**: students (Vietnamese high-school and university STEM) turning wrong exam answers into a spaced-repetition vault.
**Feeling**: a well-used sketchbook. Friendly, a little playful, never childish: mistakes are material to work with, not failures.
**Sources**: the TypeUI skills. Doodle (sky `#49B6E5`, navy `#263D5B`) and Tetris (surface `#DFE7FF`, text `#1C398E`, ink `#1C202B`, compact density) keep
their own tokens (pinned by the token test); Minimal, Cafe, Brutalism, Stitch and Retro are our own palettes in the spirit of those names.
Common to all: a 14 / 16 / 18 / 24 / 32 / 40 type scale, a 4 / 8 / 12 / 16 / 24 / 32 spacing scale, and "accessibility over novelty".

**Goals, in priority order**
1. Readable and operable by everyone: WCAG 2.2 AA, keyboard first, visible focus. The doodle look never wins a conflict with this.
2. Obvious hierarchy: one primary action per view; ink outlines show what is a surface and what is interactive.
3. Character from shape, outline, shadow and paper, never from clutter: no stickers, no emoji, and **one clean sans-serif for text in every style and language**.

`User.theme` (the account's mode) is still the Prisma enum; the legacy `OBSIDIAN` value renders as Dark (`THEME_ATTRIBUTE`). It is stored on the server,
while style, accent and layout are device preferences in localStorage.

---

## 2. Color

### 2.1 Method
Colors are hex (the skill's own values) or `oklch()`, declared once per style and mode in `globals.css`, one declaration per line. Components never
hard-code a color: use the Tailwind tokens (`bg-background`, `bg-card`, `bg-sunken`, `bg-primary`, `bg-accent`, `text-brand`, `text-muted-foreground`,
`border-border`, …). The only literal colors allowed are physical objects that do not theme: exam pages, scratchpad paper and ink.

### 2.2 Tokens (shown for Doodle; every style defines the same set)

| Token | Light | Dark | Role |
|---|---|---|---|
| `background` | `#FBF8F0` | `#131D2E` | Page paper (with dot grid) |
| `sunken` | `#F1EBDD` | `#0E1622` | Sidebar, wells |
| `card` / `popover` | `#FFFFFF` | `#1B2840` / `#223152` | Surfaces |
| `foreground` | `#111827` | `#F4F1E8` | Text and **ink** |
| `muted-foreground` / `subtle-foreground` | `#4B5563` / `#5B6472` | `#C3CBD8` / `#A3adbd` | Secondary text |
| `border`, `input` | `#111827` | `#E8EEF6` | The ink outline of every surface and control |
| `primary` | accent (default blue `#4C9AFF`; Doodle's skill sky is `#49B6E5`) | same | **Fill** of the one primary action; always outlined, never text |
| `primary-foreground` | `#111827` | `#111827` | Text on `primary` |
| `brand` | accent, darkened (default `#0052B1`) | accent, lightened (default `#6FBEFF`) | State and text accent: focus ring, links, progress |
| `accent` / `accent-foreground` | tint of the accent (default `#D8E9FF` / `#111827`) | (default `#2A4774` / `#F4F1E8`) | Selected and active fills |
| `mark`, `mark-soft`, `mark-foreground` | `#FFD84D`, `#FFF0B3`, `#5C4300` | `#F6CE45`, `#3B3210`, `#F5DE86` | Highlighter: snipped regions and the priority flag only |
| `success` / `warning` / `destructive` (+ `-soft`) | `#15803D` / `#B45309` / `#C81E1E` | `#4ADE80` / `#FBBF24` / `#F87171` | Status text and tints |

`primary`, `primary-foreground`, `brand`, `brand-hover`, `accent` and `accent-foreground` are the **accent group**: they are not part of a style. They come from the
accent colour (§2.5) and are identical in every style.

**Deviations from the skill (accessibility wins):** its success `#16A34A` and warning `#D97706` fail 4.5:1 as text on white, and its danger
`#DC2626` fails on a tinted background, so text uses the darker `#15803D`, `#B45309`, `#C81E1E`. The sky `#49B6E5` fails as text on white (about 2.4:1),
so it is only ever a fill carrying dark ink text and an ink outline.

### 2.3 Verified contrast
Enforced by `tests/design-tokens.test.ts` for all 7 styles × 2 modes, and for a sweep of accent colours (the five presets plus black, white, pure red/green/blue/yellow/…, grey) on every one of them (WCAG 2.x ratios): `foreground` ≥ 7:1 on every surface; `muted-foreground`, `subtle-foreground`, `brand` ≥ 4.5:1 on
every surface; `primary-foreground` on `primary` ≥ 4.5:1; `accent-foreground` on `accent` ≥ 4.5:1; status colors ≥ 4.5:1 on background, card and their soft tint;
`border` and `input` ≥ 3:1 against background and card (non-text contrast). The test also pins the skill's brand tokens so they are not changed by accident.
Hard offset shadows and paper patterns are decoration and carry no meaning, so they are exempt.
Each style keeps its four surfaces at least as light (Light) / dark (Dark) as `SURFACE_LIMIT` in `src/lib/appearance.ts`; that bound is what lets the accent be derived once and
still pass on every style, and the test enforces it.

### 2.4 Usage rules
- `primary` (the accent fill) is for **one** primary action per view, with the style's outline and shadow. Everything else is `outline`, `secondary` or `ghost`.
  Because the accent can be any colour, `primary` is **never used as text**: use `text-brand`.
- `brand` is state, not decoration: focus, links, progress, selection text.
- `mark` (yellow) is only for snipped regions and the priority flag.
- Exam pages, crops and the Scratchpad paper keep fixed light colors in both modes and all styles: they are physical paper.
- Never convey meaning by color alone: statuses pair a dot with a text label.

### 2.5 Appearance system (Settings → Hiển thị / Appearance)

Four independent settings, each owning its own attribute or variables, so none can bleed into another:

| Setting | Stored in | Applied as | Owns |
|---|---|---|---|
| Mode (light / dark) | account (`User.theme`) | `data-mode` on `<html>` | which palette of the style is used |
| Theme (style) | `vl:theme-style` | `data-theme` | palette per mode + shape / outline / shadow / paper variables |
| Accent colour | `vl:accent`, `vl:accent-vars` | `<style id="vl-accent">` | the accent group only |
| Layout | `vl:layout` | `data-layout` | which navigation is visible |

- **Namespacing**: a style's CSS lives only in `[data-theme="x"]` and `[data-theme="x"][data-mode="y"]` blocks and may set only `--variables` there (the test fails otherwise). The
  only element rules outside those blocks are Doodle's wobbly `.rounded-*` and the square styles' badges, both under their own `[data-theme]`.
- **Accent**: default blue, five presets (blue, green, red, purple, orange) and a native colour input. `deriveAccentVars()` computes both modes: `primary` is the colour itself;
  `primary-foreground` is ink, white or black, whichever reads at 4.5:1; `brand` slides the colour's lightness until it clears 4.5:1 on the darkest / lightest surface any style
  allows and on the tint; `accent` is a tint kept at 7:1 against the weakest body text of any style. The injected rule is `html[data-theme][data-mode="…"]`, which outranks style
  palettes and the default blue without `!important`, and touches nothing but those six variables. The default blue is hard-coded in `globals.css` (a test keeps it in sync).
- **No flash**: an inline boot script (`bootScript()` in `appearance.ts`) sets mode, language, style, layout and the accent stylesheet before first paint from localStorage,
  validating every value against a fixed set or a strict `#rrggbb` pattern. `useApplyAppearance()` (mounted in `AppShell`) keeps `<html>` in sync afterwards, including across tabs.
- **Previews**: a theme tile in Settings re-declares `data-theme` and `data-mode` on itself, so it renders in that style for real; the accent is inherited from the page.
- Adding a style: add its id to `THEME_STYLES`, a structure block + light and dark palette blocks to `globals.css` (same token set), and its name and description to both
  dictionaries. The token test then checks it automatically.

---

## 3. Typography

| Face | Use |
|---|---|
| **Inter** (`--font-inter`, then the system sans stack) | Everything: interface, titles, question and solution text, in English **and** Vietnamese. Inter ships the Vietnamese subset, so diacritics never fall back to another face |
| **JetBrains Mono** | LaTeX/Markdown source, keyboard hints, numbers that must align |

There is deliberately **one text face**. A previous version used a handwriting font for Latin and a different fallback for Vietnamese; it was hard to read and
made the two languages look unrelated, so no style may set its own font. `--font-serif` and `--font-heading` alias `--font-sans`; style character comes from
weight, size, outline and paper only. Never add a display, cursive or handwriting face, and never switch font by language.

Scale (the skill's 14 / 16 / 18 / 24 / 32 / 40), as role utilities in `globals.css`:

| Role | Size / line | Use |
|---|---|---|
| `text-display` | 32 / 40 (Doodle adds a wavy underline via `--display-line`) | One page title per view |
| `text-title` | 24 / 32 | Dialog titles, section titles |
| `text-heading` | 18 / 26 | Card and panel headings |
| `text-reading` | 18 / 30 | Question and solution content |
| body (`text-sm`) | 15 / 24 | Default interface text |
| `text-caption` | 14 / 20 | Metadata, hints |
| `text-overline` | 14 / 20, uppercase, tracked | Section labels |

Line height is ≥ 1.25 everywhere (Vietnamese stacks diacritics). Sentence case. Minimum text size is 14px; the only exceptions are numeric micro-labels (snip numbers, key hints, chart values) at 12px.

---

## 4. Space, shape, depth, icons

- **Spacing**: 4 / 8 / 12 / 16 / 24 / 32 (Tailwind `1 / 2 / 3 / 4 / 6 / 8`). Page column is centered; sections are separated by an overline label and a dashed rule.
- **Shape variables per style** (set only inside that style's `[data-theme]` block, defaults are Minimal's): `--r-xs … --r-2xl` radii, `--bw` outline width
  (1px Minimal/Cafe, 2px Doodle/Stitch/Retro/Tetris, 3px Brutalism), `--card-border-style` (solid; dashed for Stitch's seams), `--elevation-xs … lg` shadows,
  `--lift` / `--press` (how far a raised control rises on hover and sinks on press: 0 in the soft styles), `--icon-stroke`, `--paper-image` / `--paper-size`
  (none, dots, hatching, scanlines, grid), `--display-line` and `--dialog-tilt` (Doodle only).
- **Components never hard-code a style.** `rounded-*` reads `--radius-*` (which read `--r-*`), `shadow-*` reads `--elevation-*`, and unlayered rules make every
  `border-2` / card follow `--bw`. `--radius-*` stay single lengths because shadcn/Base UI size classes do arithmetic on them.
- **Outline colour**: `border` is the quiet divider colour; `input` is the control outline and must reach 3:1 (non-text contrast), so buttons and fields use `border-input`.
- **Style signatures**: Minimal soft shadows and hairlines; Doodle ink outlines, wobbly corners (`[data-theme="doodle"] .rounded-*`), hard shadows, dot grid, wavy
  title underline; Cafe warm paper and round corners; Brutalism square, 3px black, hard 3–8px shadows; Stitch dashed seams and fabric hatching; Retro beveled
  2px with scanlines (green phosphor in dark); Tetris compact square blocks on a grid.
- **Icons**: Lucide; stroke weight is the style's `--icon-stroke` (global CSS). Only where functional: sidebar destinations, toolbar tools, icon-only buttons (always with an accessible name).
  No icons in headings, badges, labelled buttons or empty states. **No emoji anywhere.**

---

## 5. Motion

Motion explains where things come from and where they go. Everything is a spring so that interrupted gestures keep their velocity.

| Preset (`src/lib/motion.ts`) | Duration · bounce | Use |
|---|---|---|
| `spring.snappy` | 0.26s · 0 | Hover/press feedback, tab and nav indicators, toggles |
| `spring.smooth` | 0.42s · 0 | Panels, sheets, sidebar collapse, list reflow (`layout`) |
| `spring.lively` | 0.5s · 0.16 | One hero moment per flow: a snip landing in the tray, a card being graded |
| `fade` | 0.16s ease-out | Opacity-only changes, backdrops |

Micro-interactions (CSS, 150ms) follow the style: in the hard-shadow styles a raised control **lifts** by `--lift` up-left on hover (shadow grows `xs` → `sm`) and **pushes in** by `--press` on press
(shadow drops to none), like pressing a stamp; the soft styles set both to 0 and only change the shadow. Doodle dialogs enter with a slight −0.4° tilt that settles (`--dialog-tilt`).

- **Shared elements**: the sidebar's active pill and every segmented control use `layoutId`, so selection *moves* instead of blinking. Their thumbs are inked (`border-2 border-border`).
- **Snip → tray**: on release the region flies to its tray slot with `spring.lively`; the page keeps a highlighter mark where it was cut.
- **Reveal**: the answer side of a review card slides 12px and fades in; grading swaps cards with a short cross-slide.
- Entrances are ≤ 12px of travel and never block input. Nothing loops. Nothing animates on a timer.
- `prefers-reduced-motion`: `MotionConfig reducedMotion="user"` drops transforms; the global CSS rule collapses transitions to instant.

---

## 6. Layout

- `AppShell`, **sidebar layout** (default): collapsible left sidebar (248px ↔ 60px rail) plus content.
- **Top bar layout** (Settings → Layout, 1024px and up): a sticky 56px horizontal bar with the logo, the five destinations (icons only below 1280px), a subject menu (the global
  subject filter), Settings, language, light / dark, and the account menu. The sidebar is hidden.
- Both navigations are always rendered and CSS shows one (`.vl-rail` / `.vl-topnav` under `[data-layout]`), so there is no flash on load. Under 1024px the slim top bar and
  sheet are used whichever layout is chosen. `--chrome` is the height of the bar above the page (3rem mobile, 0 sidebar, 3.5rem top bar): full-height workspaces and sticky
  headers subtract it instead of hard-coding a number.
  Nothing floats over content except the Scratchpad.
- Routes: `(auth)` pages have no shell; `(app)/(pages)` are a padded centered column; `sources/[id]` is the full-viewport workspace.
- Page pattern: one `text-display` title, one sentence of description, the primary action top-right; sections separated by a `text-overline` label and a dashed rule.
- Responsive: layouts work from 320px; touch targets are at least 36px (controls are 36–40px high).

---

## 7. Component rules

All states are required: default, hover, focus-visible, active, disabled, and (for inputs) invalid.

| Component | Rules |
|---|---|
| **Button `default`** | `bg-primary`, ink text, `border-2` ink, `shadow-xs`. Hover: lift + `shadow-sm`. Active: push in, no shadow. Disabled: 50% opacity, no motion. One per view |
| **Button `outline` / `secondary`** | Same construction on `card` / `accent` fill |
| **Button `ghost`** | No outline until hover/expanded; for toolbars and icon buttons |
| **Button `destructive`** | `destructive-soft` fill, `destructive` text and border; used only inside a confirm step |
| **Button `link`** | `brand` text, wavy underline |
| **Input / Textarea / Select** | `card` fill, `border-2` ink, 40px high. Focus: `ring-3` in `brand` plus `shadow-xs`. Invalid: `border-destructive` and a text error below, never color alone |
| **Badge** | Pill (`rounded-full`), `border-2`, 24px. Text only, no icon |
| **Surface / Card** | `card` fill, 2px ink, `rounded-lg`, `shadow-xs`. Interactive cards lift on hover |
| **Segmented control** | Muted track; the selected thumb is inked and animates with `layoutId` |
| **Sidebar item** | Active pill is `accent` with a 2px ink border and `shadow-xs`; `aria-current="page"` |
| **Modal / Dropdown / Scratchpad** | `popover` fill, 2px ink, `shadow-lg`. Modal is a native `<dialog>`; Scratchpad is z-70 above the lightbox (z-60) |
| **Tooltip / help popover** | Same as Dropdown, text ≤ 2 lines |
| **Status** | A colored dot plus a text label |
| **Experimental badge** | Mandatory on AI-generated problems (see `CLAUDE.md` §4.6) |

---

## 8. UX writing

### 8.1 Voice

Calm, precise, on the student's side. We sound like a good tutor's handwriting in the margin: short, specific, never
theatrical. We do not cheer, tease, or sell.

### 8.2 Rules (both languages)

1. **One language per string.** Never `Tách câu hỏi (Extract Questions)`. The interface language decides.
2. **No emoji, no decorative symbols**, no ALL CAPS for emphasis, no exclamation marks except a single genuine success.
3. **Name things the way a student would.** *Câu hỏi*, *đề thi*, *lời giải* — not *thẻ*, *nguồn*, *artifact*.
4. **Buttons are verbs; titles are nouns.** `Tải đề lên`, `Add problem`; `Kho câu hỏi`, `Sources`.
5. **Say what happens next**, not how the system works: "Câu hỏi được lưu ngay. Bạn có thể bổ sung lời giải sau."
6. **Errors**: what happened + what to do, one sentence each, no blame, no codes in the sentence.
7. **Numbers** carry units and use the locale (`12 câu`, `3 ngày`, `85%`); spell nothing out.
8. **Sentence case.** Capitalize the first word and proper nouns only.
9. **Consistent terms** — use the glossary below and never alternate synonyms for the same thing.

### 8.3 Vietnamese

- Address the student as **bạn**; the product never says *tôi* or *chúng tôi* in interface text.
- Prefer native word order and short verbs: *Tải đề lên*, *Xem lời giải*, *Đổi số liệu*. Avoid calques (*Thực hiện việc lưu* → *Lưu*).
- Keep widely used loanwords students actually say (*AI*, *PDF*, *API*); translate the rest (*tag* → *nhãn*, *review* → *ôn tập*).
- Use `…` (one character) for in-progress states and `·` to separate metadata. Quotation marks are “ ”.
- Dấu thanh đặt theo kiểu cũ thống nhất (*hoá*, *xoá*, *khoá*) trong toàn bộ giao diện.

### 8.4 English

- Second person, contractions allowed, American spelling.
- Plain verbs: *Add*, *Save*, *Remove* (reversible) vs *Delete* (permanent).
- No "please", no "simply", no "just", no "oops".

### 8.5 Glossary

| Concept | Tiếng Việt | English | Replaces |
|---|---|---|---|
| Saved question | câu hỏi | problem | thẻ, card |
| Collection of all questions | Kho câu hỏi | Problem Vault | — |
| Uploaded exam file | đề thi | source | scan, upload |
| Crop a question from a page | cắt câu hỏi | snip | khoanh, vẽ khung, extract |
| The cropped region | ảnh cắt | snip | khung, box, draft |
| Error category | nhãn lỗi | error tag | thẻ lỗi |
| The student's lesson from a mistake | rút kinh nghiệm | takeaway | Ghi chú “Aha!” |
| Flag for exam-critical questions | trọng tâm | priority | High-Yield / Cô nhấn mạnh |
| Teacher's remark | lưu ý của giáo viên | teacher's note | Cô/thầy nhấn mạnh |
| Spaced-repetition session | ôn tập | review | Đấu trường ôn tập, Review Arena |
| One graded review of a question | lần ôn | attempt | Lần |
| Ratings | Quên · Khó · Nhớ · Dễ | Again · Hard · Good · Easy | Quên (Again) … |
| Show the answer side | Xem lời giải | Show answer | Hiện lời giải & Ghi chú (Reveal) |
| AI rewrites the numbers | Đổi số liệu | New numbers | AI Đổi số liệu (Mutate Numbers on the fly) |
| AI turns an image into text | Chuyển thành văn bản | Convert to text | OCR, Tách câu hỏi (Extract Questions) |
| AI-written practice question | câu hỏi do AI tạo | AI-generated problem | Đề AI Thử Nghiệm |
| Per-subject AI summary of the learner | Bộ nhớ AI | AI memory | AI Second Brain |
| Refresh that summary | Cập nhật bộ nhớ | Update memory | Cập nhật nhận thức AI (Re-sync AI Memory) |
| AI practice area | Luyện tập | Practice | Phòng luyện đề AI, Lab |
| Stored provider credential | khoá API | API key | Kho khoá API (BYOK) |
| The two themes | Sáng · Tối | Light · Dark | Obsidian Night, Carbon Dark, Daylight |

### 8.6 Patterns

| Situation | Tiếng Việt | English |
|---|---|---|
| Primary empty state | Chưa có đề thi nào. Tải lên một tệp PDF hoặc ảnh chụp để bắt đầu cắt câu hỏi. | No sources yet. Upload a PDF or photos to start snipping problems. |
| Autosave | Đã lưu | Saved |
| Destructive confirm | Xoá câu hỏi này? Lịch sử ôn tập của câu cũng sẽ bị xoá. | Delete this problem? Its review history will be deleted too. |
| AI unavailable | Cần khoá API để dùng tính năng này. | This needs an API key. |
| AI disclaimer | Do AI tạo · Có thể có sai sót | AI-generated · May contain errors |
| Recoverable error | Không lưu được. Hãy thử lại. | Couldn't save. Try again. |

---

## 9. Accessibility criteria

1. WCAG 2.2 AA contrast for text and for the ink outline of controls (3:1), enforced by `tests/design-tokens.test.ts`.
2. **Focus is always visible**: a 3px `brand` ring with a 2px offset on every focusable element (global `:focus-visible`). Never remove an outline without replacing it.
3. Keyboard first: every action works without a pointer; dialogs trap focus and return it; Esc closes the topmost layer; tab order follows reading order.
4. Icon-only controls have an accessible name and a `title`.
5. Decorative effects (offset shadows, dot grid, wobble, wavy underline) must never be the only carrier of state or meaning.
6. Reduced motion is honored (`MotionConfig` and the global media query).
7. Text can be resized to 200% without loss; layouts reflow at 320px.
8. Language is declared (`<html lang>` follows the UI language) so the correct handwriting face and screen-reader voice are used.

---

## 10. Anti-patterns

- Hex values or arbitrary colors in components (use tokens); fake bold on a single-weight face; `font-bold` for hierarchy.
- Sky `#49B6E5` as text or as a thin icon on white; success/warning in their bright skill values as text.
- More than one `primary` button in a view; primary used for destructive or secondary actions.
- Setting a font in a style, switching fonts by language, or adding a handwriting / display face.
- A style rule that sets anything but `--variables` inside its own `[data-theme]` block, or one that is not scoped to a `[data-theme]` at all.
- Using `text-primary` / `bg-primary/..` for text or thin lines: the accent can be any colour (use `text-brand`).
- Hard-coding a radius, border width or shadow that should follow the style (use `rounded-*`, `border-2`, `shadow-*`).
- Arbitrary `rounded-[…]` on cards (it bypasses the style's radius).
- Rotating or skewing text and controls for "character" (it hurts legibility and hit targets). Only dialogs tilt, and only while entering.
- Emoji, decorative icons, stickers; mixing Vietnamese and English in one string; hard-coded user-facing strings.
- Animating on a timer or looping; motion that blocks input.

---

## 11. QA checklist

- [ ] `npm run check` is green (token contrast table, i18n, typecheck, lint).
- [ ] Each of the 7 themes in both modes: text legible, outlines visible, shadows not noisy; the Settings preview tile matches the real page.
- [ ] Accent: a preset and a custom colour (try a very light and a very dark one) update buttons, selected items, links and the focus ring in every theme; reload keeps all of it.
- [ ] Layout: sidebar and top bar both reach every page and the subject filter; below 1024px the mobile bar and sheet still work; no horizontal scroll.
- [ ] Tab through the page: focus ring visible everywhere, no traps, Esc closes dialogs.
- [ ] Vietnamese and English render in the same font; no clipped diacritics, nothing truncates a label.
- [ ] One primary button per view; destructive actions go through a confirmation.
- [ ] Reduced-motion on: nothing slides or tilts.
- [ ] 320px width: no horizontal scroll, targets ≥ 36px.
- [ ] No emoji, no hard-coded colors or strings introduced.
