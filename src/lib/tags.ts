/**
 * Adaptive error tags — pure helpers shared by the UI, the repository and the AI prompt builders.
 */
import { slugify, type TagDeclineReason } from "@/lib/constants";
import { resolveI18nKey, type Dictionary } from "@/lib/i18n";
import type { AdaptiveTag, PersonaPreferences, TagFeedbackEntry, TagSuggestionFeedback } from "@/lib/repo/types";

/** GUI name of a tag: base tags follow the GUI language until renamed (renaming clears `i18nKey`). */
export function tagDisplayName(dictionary: Dictionary, tag: Pick<AdaptiveTag, "i18nKey" | "name">): string {
  return tag.i18nKey ? (resolveI18nKey(dictionary, tag.i18nKey) ?? tag.name) : tag.name;
}

/** Live tags usable on a card of `subjectId`: the subject's own tags plus global ones (never archived/merged tags). */
export function tagsForSubject<T extends Pick<AdaptiveTag, "subjectId" | "archivedAt" | "mergedIntoId">>(tags: readonly T[], subjectId: string | null): T[] {
  return tags.filter((tag) => tag.archivedAt === null && tag.mergedIntoId === null && (tag.subjectId === null || tag.subjectId === subjectId));
}

/** A slug unique among `taken` (`foo`, `foo-2`, `foo-3` …). */
export function uniqueSlug(name: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const base = slugify(name);
  let slug = base;
  for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
  return slug;
}

const normalizeName = (name: string) => name.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");

/** Same tag name, ignoring case, whitespace and Unicode composition. */
export function sameTagName(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}

/** Stored form of a decline reason: `too_specific`, `not_my_intent` or `other: <free text>`. */
export function formatDeclineReason(reason: TagDeclineReason, detail?: string | null): string {
  if (reason !== "other") return reason;
  const text = detail?.trim().replace(/\s+/g, " ").slice(0, 280);
  return text ? `other: ${text}` : "other";
}

export function parseDeclineReason(stored: string | null): { reason: TagDeclineReason; detail: string | null } | null {
  if (!stored) return null;
  if (stored === "too_specific" || stored === "not_my_intent") return { reason: stored, detail: null };
  if (stored === "other") return { reason: "other", detail: null };
  if (stored.startsWith("other:")) return { reason: "other", detail: stored.slice(6).trim() || null };
  // Free text written by an older client / imported data.
  return { reason: "other", detail: stored };
}

export const TAG_FEEDBACK_MEMORY = 20;

/** Prepend a decline to the persona preferences (most recent first, capped). Returns a new object. */
export function rememberTagFeedback(preferences: PersonaPreferences | null, entry: TagFeedbackEntry, cap = TAG_FEEDBACK_MEMORY): PersonaPreferences {
  const previous = preferences?.tagFeedback ?? [];
  return { ...(preferences ?? {}), tagFeedback: [entry, ...previous].slice(0, cap) };
}

/**
 * Compress the learner's decline history into short English directives for the prompt (the model reads English
 * instructions best; the output-language directive still governs what it writes).
 */
export function tagFeedbackDirectives(entries: readonly TagFeedbackEntry[], subjectId: string | null): string[] {
  const relevant = entries.filter((e) => e.subjectId === null || subjectId === null || e.subjectId === subjectId);
  const tooSpecific = relevant.filter((e) => e.reason === "too_specific");
  const notIntent = relevant.filter((e) => e.reason === "not_my_intent");
  const other = relevant.filter((e) => e.reason === "other" && e.detail);
  const names = (list: readonly TagFeedbackEntry[]) =>
    list
      .map((e) => e.proposedName)
      .filter((n): n is string => Boolean(n))
      .slice(0, 5)
      .map((n) => `"${n}"`)
      .join(", ");
  const lines: string[] = [];
  if (tooSpecific.length > 0) {
    lines.push(
      `The learner declined ${tooSpecific.length} suggestion(s) as TOO SPECIFIC (${names(tooSpecific)}). Prefer broad, reusable error categories that would apply to many future mistakes.`,
    );
  }
  if (notIntent.length > 0) {
    lines.push(`The learner said ${notIntent.length} suggestion(s) did NOT match how they think about their mistakes (${names(notIntent)}). Do not propose similar ideas again.`);
  }
  for (const e of other.slice(0, 5)) lines.push(`Declined ${e.proposedName ? `"${e.proposedName}"` : "a suggestion"} because: ${e.detail}`);
  return lines;
}

/** Names already proposed and declined/accepted for this subject — never propose them again. */
export function resolvedSuggestionNames(suggestions: readonly TagSuggestionFeedback[], subjectId: string): string[] {
  return suggestions.filter((s) => s.subjectId === subjectId && s.status !== "PENDING" && s.proposedName).map((s) => s.proposedName!);
}
