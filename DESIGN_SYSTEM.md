# VaultLearn — Design & Copywriting System

The single source of truth for how VaultLearn looks, moves and speaks. Tokens live in
[`src/app/globals.css`](src/app/globals.css), motion presets in [`src/lib/motion.ts`](src/lib/motion.ts), copy in
[`src/lib/i18n/dictionaries`](src/lib/i18n/dictionaries). The contrast table in §2 is enforced by
[`tests/design-tokens.test.ts`](tests/design-tokens.test.ts), and the copy rules in §8 by
[`tests/i18n.test.ts`](tests/i18n.test.ts) — if you change a token or a string, those tests tell you whether you broke the system.

---

## 1. Where this comes from

The system is a synthesis, not a copy. Each reference contributed one idea that is actually used here.

| Reference | What we took | Where it shows up |
|---|---|---|
| **Linear** — [How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui) | Build themes in a perceptually uniform space (LCH) from a few inputs — base, accent, contrast — so elevation steps look even in light and dark. | Every color is authored as `oklch()`; surfaces are a lightness ladder at one hue (§2). |
| **Stripe** — [Designing accessible color systems](https://stripe.com/blog/accessible-color-systems) | Tune lightness perceptually so every text/surface pair clears WCAG thresholds by construction, not by luck. | The verified contrast table (§2.3) and its unit test. |
| **Apple** — [Animate with springs, WWDC23](https://developer.apple.com/videos/play/wwdc2023/10158/) | Describe springs with two numbers, *duration* and *bounce*. Default to bounce 0; stay under ~0.3 for UI. Springs keep velocity when interrupted. | The three spring presets (§5). |
| **Readwise Reader** — [Appearance](https://docs.readwise.io/reader/docs/faqs/appearance) | Reading surfaces get reading themes: warm backgrounds, calm text color, highlight color as a first-class token. | The Paper theme, the serif reading face, the highlighter token `--mark` used for snips. |
| **Anthropic Claude** | Warm, slightly yellow neutrals instead of blue-gray; a serif for content next to a quiet sans for chrome; ink-colored primary actions. | Neutral hue 75–88°, Source Serif 4 for questions and titles, `--primary` is ink, not a brand gradient. |
| **Microsoft** — [Vietnamese localization style guide](https://download.microsoft.com/download/b/f/e/bfecb1b4-21ab-48fd-a48c-c2471b026f8f/vie-vnm-StyleGuide.pdf) | A product voice is localized, not translated: conversational, direct, native word order, one language per label. | The Vietnamese copy rules (§8). |

Honest limits: the eye-comfort literature is mixed — there is no strong evidence that dark mode by itself reduces strain. What is
well supported is avoiding the extremes: pure white backgrounds (glare), pure black with pure white text (halation, worse with
astigmatism), and low-contrast body text. Both themes are built around that, and the choice between them is left to the student.

---

## 2. Color

### 2.1 Method

1. **One neutral hue per theme.** Paper neutrals sit at OKLCH hue 75–88° (a soft yellow warmth); Dark neutrals at 80–85° with
   almost no chroma, so dark surfaces read as graphite rather than blue-black.
2. **Surfaces are a lightness ladder**, not a pile of opacities: `sunken → background → card → popover`. Each step is ~0.02–0.03
   OKLCH lightness, enough to separate layers without borders doing all the work.
3. **Three text levels**, each verified against every surface it can sit on: `foreground` (≥ 7:1, AAA), `muted-foreground` and
   `subtle-foreground` (≥ 4.5:1, AA).
4. **Ink is the primary action.** Primary buttons are solid `foreground` on `background`. The one chromatic accent — **ink blue**,
   `--brand` — is reserved for *state*: focus, selection, links, progress, the active snip.
5. **The highlighter is the signature.** `--mark` is the yellow of a highlighter pen. It marks snipped regions on an exam page
   (blended with `multiply`, like real marker on paper) and the "priority" flag. It is never decoration.
6. **No pure white, no pure black.** The lightest surface is `#FEFCF7`; the darkest is `#110F0D`.

### 2.2 Tokens

| Token | Paper (OKLCH `L C H`) | Paper hex | Dark (OKLCH `L C H`) | Dark hex |
|---|---|---|---|---|
| `--background` | `0.966 0.014 88` | `#F8F3E9` | `0.195 0.005 80` | `#161512` |
| `--sunken` | `0.945 0.016 88` | `#F1ECE1` | `0.17 0.005 80` | `#110F0D` |
| `--card` | `0.984 0.01 88` | `#FDFAF2` | `0.228 0.006 80` | `#1E1C19` |
| `--popover` | `0.992 0.007 88` | `#FEFCF7` | `0.262 0.006 80` | `#262421` |
| `--border` | `0.905 0.016 86` | `#E4DFD4` | `0.275 0.006 80` | `#292724` |
| `--border-strong` | `0.86 0.018 85` | `#D6D0C4` | `0.325 0.007 80` | `#363430` |
| `--input` | `0.625 0.02 82` | `#8E877A` | `0.53 0.008 80` | `#6E6B67` |
| `--foreground` | `0.255 0.012 75` | `#26221C` | `0.93 0.01 85` | `#EBE7E0` |
| `--muted-foreground` | `0.45 0.014 78` | `#5A544D` | `0.74 0.01 85` | `#AEAAA4` |
| `--subtle-foreground` | `0.525 0.014 80` | `#6F6A61` | `0.65 0.01 85` | `#928F88` |
| `--brand` | `0.45 0.145 264` | `#2A4FA4` | `0.78 0.105 264` | `#95B7FB` |
| `--brand-hover` | `0.4 0.145 264` | `#1D4094` | `0.83 0.08 264` | `#ADC7FC` |
| `--accent` | `0.93 0.032 264` | `#DDE8FE` | `0.3 0.05 264` | `#212D47` |
| `--accent-foreground` | `0.38 0.13 264` | `#1D3C86` | `0.84 0.075 264` | `#B2CBFC` |
| `--mark` | `0.885 0.13 96` | `#F3D96E` | `0.84 0.13 92` | `#E9C85E` |
| `--mark-soft` | `0.945 0.07 96` | `#FAEDB8` | `0.31 0.045 92` | `#383014` |
| `--mark-foreground` | `0.4 0.075 80` | `#5D420E` | `0.86 0.11 92` | `#EBCF7A` |
| `--success` | `0.5 0.105 152` | `#2B7444` | `0.78 0.12 155` | `#73CE95` |
| `--success-soft` | `0.945 0.035 152` | `#DCF4E2` | `0.28 0.04 155` | `#182F20` |
| `--warning` | `0.53 0.115 68` | `#975D04` | `0.8 0.115 80` | `#E5B562` |
| `--warning-soft` | `0.945 0.045 88` | `#F9ECCB` | `0.29 0.04 80` | `#362913` |
| `--destructive` | `0.52 0.165 28` | `#B5352D` | `0.74 0.13 25` | `#F28881` |
| `--destructive-soft` | `0.945 0.025 28` | `#FDE7E4` | `0.28 0.05 25` | `#3E1E1C` |

Derived aliases: `--primary` = `--foreground`, `--primary-foreground` = `--background`, `--ring` = `--brand`,
`--muted` / `--secondary` = a 5–6% ink wash over the current surface (hover and quiet fills).

### 2.3 Verified contrast (WCAG 2.x)

Computed from the tokens above; the same pairs run in `tests/design-tokens.test.ts`.

| Pair (text on surface) | Target | Paper | Dark |
|---|---|---|---|
| `foreground` on `background` / `card` / `sunken` / `popover` | ≥ 7:1 | 14.30 / 15.16 / 13.42 / 15.42 | 14.82 / 13.79 / 15.52 / 12.56 |
| `muted-foreground` on `background` / `card` / `sunken` / `popover` | ≥ 4.5:1 | 6.76 / 7.16 / 6.34 / 7.29 | 7.90 / 7.35 / 8.27 / 6.70 |
| `subtle-foreground` on `background` / `card` / `sunken` / `popover` | ≥ 4.5:1 | 4.86 / 5.15 / 4.56 / 5.24 | 5.66 / 5.27 / 5.93 / 4.80 |
| `primary-foreground` on `primary` (buttons) | ≥ 7:1 | 14.30 | 14.82 |
| `brand` on `background` / `card` / `sunken` | ≥ 4.5:1 | 6.90 / 7.31 / 6.48 | 9.08 / 8.45 / 9.51 |
| `accent-foreground` on `accent` (selected rows, chips) | ≥ 4.5:1 | 8.35 | 8.39 |
| `mark-foreground` on `mark-soft` (priority chip) | ≥ 4.5:1 | 7.94 | 8.58 |
| `success` on `background` / `success-soft` | ≥ 4.5:1 | 5.15 / 4.91 | 9.56 / 7.50 |
| `warning` on `background` / `warning-soft` | ≥ 4.5:1 | 4.89 / 4.61 | 9.67 / 7.49 |
| `destructive` on `background` / `destructive-soft` | ≥ 4.5:1 | 5.41 / 5.05 | 7.49 / 6.12 |
| `input` (control border) on `background` / `card` | ≥ 3:1 | 3.22 / 3.41 | 3.44 / 3.21 |

`--border` and `--border-strong` are hairlines that *separate* regions (≈ 1.2–1.5:1 by design). Anything a user must *find* to
operate — an input's edge, a focus ring — uses `--input` or `--ring`, which clear 3:1.

### 2.4 Usage rules

- Text is `foreground`, `muted-foreground` or `subtle-foreground`. Never lower the opacity of text to make it quieter.
- `brand` never fills large areas. Selected states use `accent` + `accent-foreground`.
- Status is a 6px dot plus a word. Color alone never carries meaning.
- Review ratings map to semantics: Again → `destructive`, Hard → `warning`, Good → `success`, Easy → `brand`.
- Exam pages are photographs of paper: they keep their own white in both themes, sit on `sunken`, and get a hairline.
- Subject and tag swatches come from one perceptually even ramp (OKLCH L 0.60, C ≈ 0.115) so no subject shouts:
  `#5D7EC5` `#906DB7` `#258ABB` `#3D9461` `#A5761D` `#BB6456` `#B56184` `#209292`. They appear only as dots and thin rules.
- No hex values in components. Use the Tailwind tokens (`bg-card`, `text-muted-foreground`, `border-border`, `text-brand`, `bg-mark` …).

---

## 3. Typography

| Role | Family | Use |
|---|---|---|
| **Interface** | Inter (`--font-sans`) | Navigation, buttons, labels, tables, numbers (`tabular-nums`). |
| **Reading** | Source Serif 4 (`--font-serif`) | Page titles, question text, solutions, notes rendered as content. Pairs with KaTeX's serif math so prose and formulas read as one voice. |
| **Source** | JetBrains Mono (`--font-mono`) | Markdown/LaTeX being edited, keyboard hints. |

All three ship the Vietnamese subset.

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `display` | 30 / 38, serif, −0.01em | 500 | Page title (`h1`), one per page |
| `title` | 20 / 28, serif | 500 | Section and dialog titles |
| `heading` | 15 / 22 | 600 | Card titles, group headers |
| `body` | 14 / 22 | 400 | Interface text |
| `reading` | 16 / 27, serif | 400 | Questions, solutions, notes |
| `caption` | 12.5 / 18 | 400–500 | Metadata, hints |
| `overline` | 11 / 16, +0.06em, uppercase | 600 | Section labels in the sidebar and group dividers |

Rules: reading measure 60–75 characters; line-height never below 1.25 for any text that can contain Vietnamese (stacked
diacritics — Ế, ỗ, ặ — clip otherwise) and never below 1.5 for running text; weight contrast over size contrast; sentence
case everywhere (Vietnamese has no title case — do not capitalize Every Word).

---

## 4. Space, shape, depth, icons

- **Spacing**: 4px grid. Component padding 12/16/20/24; page gutter 24 (16 on phones); section gap 32–40.
- **Radius**: controls 8px, cards 12px, sheets and dialogs 16px, chips and dots fully round. Nested radii shrink by the padding.
- **Depth** has three levels and each level uses one cue first: *sunken* (sidebar, document well) is darker; *resting*
  (cards) is a hairline plus `--shadow-xs`; *floating* (menus, dialogs, the snip in flight) is `--shadow-lg`. In Dark,
  elevation is expressed by lighter surfaces; shadows only anchor floating layers.
- **Icons**: Lucide at a 1.5 stroke (set globally in CSS), 16px in controls and 18px in navigation, always inheriting text
  color. An icon appears only where it does a job: identifying a destination in the collapsed sidebar, a tool in a
  toolbar, or an icon-only button (which always has an accessible name). Headings, badges and body text carry no icons.
- **No emoji, anywhere** — not in labels, headings, badges, placeholders, toasts or empty states. Emphasis comes from
  type, spacing and the status dot.

---

## 5. Motion

Motion explains where things come from and where they go. Everything is a spring so that interrupted gestures keep their velocity.

| Preset (`src/lib/motion.ts`) | Duration · bounce | Use |
|---|---|---|
| `spring.snappy` | 0.26s · 0 | Hover/press feedback, tab and nav indicators, toggles |
| `spring.smooth` | 0.42s · 0 | Panels, sheets, sidebar collapse, list reflow (`layout`) |
| `spring.lively` | 0.5s · 0.16 | One hero moment per flow: a snip landing in the tray, a card being graded |
| `fade` | 0.16s ease-out | Opacity-only changes, backdrops |

Choreography:

- **Shared elements**: the sidebar's active pill and every segmented control use `layoutId`, so selection *moves* instead of blinking.
- **Snip → tray**: on release, the selected region lifts off the page (`--shadow-lg`), flies to its slot in the tray with
  `spring.lively`, and the tray reflows with `layout`. The page keeps a highlighter mark where it was cut.
- **Reveal**: the answer side of a review card slides 12px and fades in; grading swaps cards with a short cross-slide.
- **Sheets** (problem detail, mobile navigation) enter from their edge with `spring.smooth` over a fading scrim.
- **Cursor and scroll**: the snip tool shows hairline crosshair guides that follow the pointer; cards answer hover with a 1px
  lift; page headers gain a hairline only once content scrolls beneath them.
- Entrances are ≤ 12px of travel and never block input. Nothing loops. Nothing animates on a timer.
- `prefers-reduced-motion`: a global `MotionConfig reducedMotion="user"` drops transforms and keeps short fades; CSS transitions collapse to instant.

---

## 6. Layout

- **Shell**: a collapsible left sidebar (248px ↔ 60px icon rail) and a content column. The sidebar is in normal flow — nothing
  floats over content. Under 1024px it becomes a sheet opened from a slim top bar.
- **Sidebar order**: Overview, Review (with today's count), Problem Vault, Sources, Practice · Subjects (the global filter) ·
  Settings and the account menu (accounts, theme, language).
- **Pages**: max width 1120px for libraries and dashboards, 720px for reading and forms. One serif title, one sentence of
  description, primary action top-right.
- **Source workspace**: full height, two panes. Left: the document on a sunken well, continuous scroll, snip tool on by
  default. Right: the snippets tray (400px). Each snippet is one card — image, tags, solution, takeaway — and saves itself.
- **Problem Vault**: one responsive grid of cards with sticky controls for search, grouping, sorting and filters; groups are
  separated by an overline label and a hairline.

---

## 7. Component rules

- **Buttons**: one primary (ink) per view. Secondary actions are outline or ghost. Destructive actions are ghost-red until confirmed.
  Labels are verbs. Height 32px (28px in toolbars, 40px for the main call to action).
- **Fields**: label above, hint below, error replaces hint. Inline editors in cards are quiet (filled, borderless) and save
  on pause; forms in dialogs use bordered inputs and an explicit Save.
- **Cards**: a hairline, 12px radius, `--shadow-xs`. A card that opens something lifts 1px on hover.
- **Badges**: neutral by default; tinted only for state (AI-generated, priority, overdue).
- **Empty states**: one sentence on what belongs here, one action. No illustration.
- **AI output** is always labeled with the amber *AI-generated* note (`ExperimentalBadge`) and never auto-saved over the student's own text.

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
