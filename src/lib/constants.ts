/**
 * Client-safe mirrors of Prisma enums + domain constants.
 * Keep these unions in sync with prisma/schema.prisma (a type-level check lives in tests/constants.test.ts).
 */

export const LANGUAGES = ["VI", "EN"] as const;
export type Language = (typeof LANGUAGES)[number];

export const THEMES = ["OBSIDIAN", "DARK_GRAY", "LIGHT"] as const;
export type ThemePreference = (typeof THEMES)[number];

/** `data-theme` attribute value on <html> for each theme. */
export const THEME_ATTRIBUTE: Record<ThemePreference, string> = {
  OBSIDIAN: "obsidian",
  DARK_GRAY: "dark-gray",
  LIGHT: "light",
};

export const AI_PROVIDERS = ["GEMINI", "OPENAI", "ANTHROPIC", "CUSTOM"] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

export const SYNTHESIS_MIX_MIN_SOURCES = 2;
export const SYNTHESIS_MIX_MAX_SOURCES = 3;

/** Label rendered (via i18n) on every AI-synthesized problem. */
export const EXPERIMENTAL_BADGE_I18N_KEY = "synth.experimentalBadge";

export interface BaseTagDefinition {
  slug: string;
  i18nKey: string;
  color: string;
  /** Fallback names when seeding (GUI displays the i18n key instead). */
  name: Record<Language, string>;
}

/**
 * The four base error tags seeded for every SUBJECT (origin = BASE, scopeKey = subjectId), so each subject can evolve
 * its own vocabulary (an IELTS rename never touches TSA Math). Display names follow the GUI language via `i18nKey`
 * until the user accepts a rename, which clears `i18nKey` and pins the custom name.
 */
export const BASE_TAGS: readonly BaseTagDefinition[] = [
  {
    slug: "concept_gap",
    i18nKey: "tags.base.concept_gap",
    color: "#A855F7",
    name: { VI: "Hổng kiến thức nền", EN: "Foundational gap" },
  },
  {
    slug: "misread",
    i18nKey: "tags.base.misread",
    color: "#38BDF8",
    name: { VI: "Đọc lướt / Bẫy đề", EN: "Skimmed / Question trap" },
  },
  {
    slug: "stuck_approach",
    i18nKey: "tags.base.stuck_approach",
    color: "#10B981",
    name: { VI: "Tắc hướng biến đổi", EN: "Stuck on the approach" },
  },
  {
    slug: "calculation",
    i18nKey: "tags.base.calculation",
    color: "#F43F5E",
    name: { VI: "Sai tính toán / Thao tác", EN: "Calculation / execution slip" },
  },
];

/** Retired base-tag slugs → the base tag that absorbs their card links (IndexedDB v4 migration). */
export const RETIRED_BASE_TAG_SLUGS: Readonly<Record<string, string>> = { careless: "calculation" };

/** Deterministic id of a subject's base tag, so seeding is idempotent and concurrent loads cannot duplicate it. */
export function baseTagId(subjectId: string, slug: string): string {
  return `tag-base-${subjectId}-${slug}`;
}

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

/** Subject accent palette (stored on Subject.color). */
export const SUBJECT_COLORS = ["#6366F1", "#A855F7", "#38BDF8", "#10B981", "#F59E0B", "#F43F5E", "#EC4899", "#14B8A6"] as const;

export const STORAGE_KEYS = {
  prefs: "vl:prefs",
  activeAccount: "vl:account",
  activeSubject: "vl:subject",
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

/** Upload limits for the scanner (client-side guard; the file never leaves the device except cropped images sent to OCR). */
export const SCAN_LIMITS = {
  maxFileBytes: 60 * 1024 * 1024,
  maxPdfPages: 300,
  /** Long edge (px) a PDF page / photo is rendered at in the studio. */
  renderLongEdge: 2600,
  /** Long edge (px) of a crop sent to the vision model. */
  ocrLongEdge: 1600,
  maxBoxesPerScan: 40,
} as const;
