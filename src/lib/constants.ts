/**
 * Client-safe mirrors of Prisma enums + domain constants.
 * Keep these unions in sync with prisma/schema.prisma (a type-level check lives in tests/constants.test.ts).
 */

export const LANGUAGES = ["VI", "EN"] as const;
export type Language = (typeof LANGUAGES)[number];

export const THEMES = ["OBSIDIAN", "DARK_GRAY", "LIGHT"] as const;
export type ThemePreference = (typeof THEMES)[number];

/**
 * `data-theme` attribute value on <html> for each stored preference. The interface ships two themes — Paper (light)
 * and Dark (DESIGN_SYSTEM.md §2); the legacy `OBSIDIAN` value renders as Dark so stored preferences keep working.
 */
export const THEME_ATTRIBUTE: Record<ThemePreference, "light" | "dark"> = {
  OBSIDIAN: "dark",
  DARK_GRAY: "dark",
  LIGHT: "light",
};

/** The themes a user can pick, and the value each one stores. */
export const THEME_CHOICES = [
  { value: "LIGHT", mode: "light" },
  { value: "DARK_GRAY", mode: "dark" },
] as const satisfies readonly { value: ThemePreference; mode: "light" | "dark" }[];

export const DEFAULT_THEME: ThemePreference = "LIGHT";

export const USER_ROLES = ["USER", "ADMIN"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const AI_PROVIDERS = ["GEMINI", "OPENAI", "ANTHROPIC", "CUSTOM"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const SYNTHESIS_MIX_MIN_SOURCES = 2;
export const SYNTHESIS_MIX_MAX_SOURCES = 3;

/** Label rendered (via i18n) on every AI-synthesized problem. */
export const EXPERIMENTAL_BADGE_I18N_KEY = "ai.generatedBadge";

export interface BaseTagDefinition {
  slug: string;
  i18nKey: string;
  color: string;
  /** Fallback names when seeding (GUI displays the i18n key instead). */
  name: Record<Language, string>;
}

/**
 * The four base error tags seeded for every SUBJECT (origin = BASE, scopeKey = subjectId, looked up by slug), so each subject can evolve
 * its own vocabulary (an IELTS rename never touches TSA Math). Display names follow the GUI language via `i18nKey`
 * until the user accepts a rename, which clears `i18nKey` and pins the custom name.
 */
export const BASE_TAGS: readonly BaseTagDefinition[] = [
  {
    slug: "concept_gap",
    i18nKey: "tags.base.concept_gap",
    color: "#906DB7",
    name: { VI: "Hổng kiến thức", EN: "Knowledge gap" },
  },
  {
    slug: "misread",
    i18nKey: "tags.base.misread",
    color: "#258ABB",
    name: { VI: "Đọc sai đề", EN: "Misread the question" },
  },
  {
    slug: "stuck_approach",
    i18nKey: "tags.base.stuck_approach",
    color: "#3D9461",
    name: { VI: "Bí hướng giải", EN: "Stuck on the approach" },
  },
  {
    slug: "calculation",
    i18nKey: "tags.base.calculation",
    color: "#BB6456",
    name: { VI: "Tính toán sai", EN: "Calculation slip" },
  },
];

/** Value of `AdaptiveTag.scopeKey` for a tag in the given subject (or global). */
export function tagScopeKey(subjectId: string | null | undefined): string {
  return subjectId ?? "global";
}

/**
 * Resolve the language the AI must answer in.
 * Priority: Subject → API key → user default. This is independent of the GUI language.
 */
export function resolveAiOutputLanguage(input: {
  subject?: { aiOutputLanguage: Language | null } | null;
  apiKey?: { aiOutputLanguage: Language | null } | null;
  user: { defaultAiOutputLanguage: Language };
}): Language {
  return input.subject?.aiOutputLanguage ?? input.apiKey?.aiOutputLanguage ?? input.user.defaultAiOutputLanguage;
}

// ── Phase 2: AI model catalog, subject palette, storage keys ───────────────

export const AI_MODEL_TIERS = ["LIGHT", "HEAVY"] as const;
export type AiModelTier = (typeof AI_MODEL_TIERS)[number];

export interface AiModelOption {
  id: string;
  label: string;
  tier: AiModelTier;
  vision: boolean;
}

export interface AiProviderMeta {
  label: string;
  models: readonly AiModelOption[];
  /** Whether the user must supply a base URL. */
  requiresBaseUrl: boolean;
}

/** Model tiers: LIGHT = OCR / tag suggestions / summaries, HEAVY = problem synthesis. */
export const AI_PROVIDER_META: Record<AiProvider, AiProviderMeta> = {
  GEMINI: {
    label: "Google Gemini",
    requiresBaseUrl: false,
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", tier: "LIGHT", vision: true },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", tier: "HEAVY", vision: true },
    ],
  },
  OPENAI: {
    label: "OpenAI",
    requiresBaseUrl: false,
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o mini", tier: "LIGHT", vision: true },
      { id: "gpt-4o", label: "GPT-4o", tier: "HEAVY", vision: true },
    ],
  },
  ANTHROPIC: {
    label: "Anthropic Claude",
    requiresBaseUrl: false,
    models: [
      { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", tier: "LIGHT", vision: true },
      { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", tier: "HEAVY", vision: true },
    ],
  },
  CUSTOM: {
    label: "Custom (OpenAI-compatible)",
    requiresBaseUrl: true,
    models: [],
  },
};

/**
 * Subject / tag swatches (stored on Subject.color and AdaptiveTag.color): one perceptually even ramp
 * (OKLCH L 0.60, C ≈ 0.115) so no subject shouts on either theme. See DESIGN_SYSTEM.md §2.4.
 */
export const SUBJECT_COLORS = ["#5D7EC5", "#906DB7", "#258ABB", "#3D9461", "#A5761D", "#BB6456", "#B56184", "#209292"] as const;

/** Swatches stored by earlier versions → their counterpart on the current ramp. */
const LEGACY_SWATCHES: Readonly<Record<string, string>> = {
  "#6366F1": "#5D7EC5", "#A855F7": "#906DB7", "#38BDF8": "#258ABB", "#10B981": "#3D9461",
  "#F59E0B": "#A5761D", "#F43F5E": "#BB6456", "#EC4899": "#B56184", "#14B8A6": "#209292",
};

/** Color to draw for a stored swatch (legacy values are mapped onto the current ramp); null when none is stored. */
export function swatchColor(color: string | null | undefined): string | null {
  if (!color) return null;
  return LEGACY_SWATCHES[color.toUpperCase()] ?? color;
}

export const STORAGE_KEYS = {
  prefs: "vl:prefs",
  activeSubject: "vl:subject",
  sidebar: "vl:sidebar",
  vaultView: "vl:vault-view",
  sourcesView: "vl:sources-view",
} as const;

export function slugify(input: string): string {
  const slug = input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "untitled";
}

// ── Phase 3: exam scanner ──────────────────────────────────────────────────

export const FILE_KINDS = ["PDF", "IMAGE"] as const;
export type FileKind = (typeof FILE_KINDS)[number];

export const OCR_STATUSES = ["MANUAL", "PENDING", "PROCESSING", "NEEDS_REVIEW", "DONE", "FAILED"] as const;
export type OcrStatus = (typeof OCR_STATUSES)[number];

export const TAG_ORIGINS = ["BASE", "USER", "AI_ACCEPTED"] as const;
export type TagOrigin = (typeof TAG_ORIGINS)[number];

export const TAG_ASSIGNERS = ["USER", "AI"] as const;
export type TagAssigner = (typeof TAG_ASSIGNERS)[number];

// ── Phase 4: review arena, second brain, adaptive tags, synthesizer ───────

export const TAG_SUGGESTION_KINDS = ["CREATE", "RENAME", "MERGE"] as const;
export type TagSuggestionKind = (typeof TAG_SUGGESTION_KINDS)[number];

export const SUGGESTION_STATUSES = ["PENDING", "ACCEPTED", "REJECTED", "EXPIRED"] as const;
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number];

export const SYNTHESIS_MODES = ["CLONE", "MIX"] as const;
export type SynthesisMode = (typeof SYNTHESIS_MODES)[number];

export const EXAM_PREP_STATUSES = ["DRAFT", "ACTIVE", "COMPLETED", "ARCHIVED"] as const;
export type ExamPrepStatus = (typeof EXAM_PREP_STATUSES)[number];

/** Quick reasons offered when the user declines an AI tag suggestion ("other" carries free text). */
export const TAG_DECLINE_REASONS = ["too_specific", "not_my_intent", "other"] as const;
export type TagDeclineReason = (typeof TAG_DECLINE_REASONS)[number];

/** At most this many PENDING tag suggestions per subject; older ones expire when new ones arrive. */
export const MAX_PENDING_TAG_SUGGESTIONS = 3;

/** Bumped whenever the synthesizer prompt contract changes (stored on every AiSynthesizedProblem). */
export const SYNTH_PROMPT_VERSION = "synth-v1";

/** Upload limits for sources, checked in the browser and enforced again by the upload route. */
export const SCAN_LIMITS = {
  maxFileBytes: 60 * 1024 * 1024,
  maxPdfPages: 300,
  /** Long edge (px) a PDF page / photo is rendered at in the studio. */
  renderLongEdge: 2600,
  /** Long edge (px) of a crop sent to the vision model. */
  ocrLongEdge: 1600,
  /** Long edge (px) of the thumbnail kept for the Sources library. */
  thumbnailLongEdge: 640,
  /** Largest question crop / figure image accepted for one problem. */
  maxCropBytes: 8 * 1024 * 1024,
} as const;
