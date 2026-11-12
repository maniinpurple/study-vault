/**
 * "Second Brain" — builds the compact, ref-labelled digest of a subject that the memory sync / tag suggester read.
 * Pure and client-safe: the browser assembles it from the local snapshot and sends it to the server route.
 */
import type { Dictionary } from "@/lib/i18n";
import type { DigestCard, DigestTag, MemorySyncRequest, TagSuggestRequest } from "@/lib/brain-prompt";
import type {
  AdaptiveTag, CardAttemptLog, MistakeCard, MistakeCardTag, Subject, SubjectMemoryInsights, TagSuggestionFeedback, Topic, UserAiPersona,
} from "@/lib/repo/types";
import { tagDisplayName, tagsForSubject } from "@/lib/tags";

export const EMPTY_INSIGHTS: SubjectMemoryInsights = { overcome: [], blindSpots: [], thinkingPatterns: [], teacherEmphasis: [], nextFocus: [] };

const clip = (value: string | null | undefined, max: number): string | null => {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export interface DigestOptions {
  maxCards?: number;
  /** Most recent attempts kept per card. */
  maxAttempts?: number;
  /** Only cards that carry some learner signal (notes or attempts) — used by the tag suggester. */
  withNotesOnly?: boolean;
}

/** Informativeness used to order (and cap) the digest: notes, attempts, lapses, high-yield, recency. */
function informativeness(card: MistakeCard, attempts: readonly CardAttemptLog[]): number {
  const notes = attempts.filter((a) => a.note).length + (card.ahaNote ? 1 : 0) + (card.highYieldNote ? 1 : 0);
  const fails = attempts.filter((a) => a.rating === "AGAIN" || a.rating === "HARD").length;
  return notes * 3 + fails * 2 + card.lapses * 2 + (card.isHighYield ? 2 : 0) + Math.min(attempts.length, 6) * 0.5;
}

/**
 * Digest of a subject's cards: C1…Cn refs, truncated text, chronological attempts (most recent `maxAttempts`).
 * Sorted by informativeness so a cap keeps the cards that teach the model the most.
 */
export function buildCardDigest(input: {
  subjectId: string;
  cards: readonly MistakeCard[];
  logs: readonly CardAttemptLog[];
  topics: readonly Topic[];
  tags: readonly AdaptiveTag[];
  cardTags: readonly MistakeCardTag[];
  dictionary: Dictionary;
  options?: DigestOptions;
}): DigestCard[] {
  const { maxCards = 60, maxAttempts = 8, withNotesOnly = false } = input.options ?? {};
  const topicName = new Map(input.topics.map((t) => [t.id, t.name]));
  const tagName = new Map(input.tags.map((t) => [t.id, tagDisplayName(input.dictionary, t)]));
  const logsByCard = new Map<string, CardAttemptLog[]>();
  for (const log of input.logs) logsByCard.set(log.cardId, [...(logsByCard.get(log.cardId) ?? []), log]);

  const rows = input.cards
    .filter((c) => c.subjectId === input.subjectId && c.archivedAt === null)
    .map((card) => {
      const attempts = (logsByCard.get(card.id) ?? []).sort((a, b) => a.attemptNumber - b.attemptNumber);
      return { card, attempts, score: informativeness(card, attempts) };
    })
    .filter((r) => !withNotesOnly || r.card.ahaNote || r.card.highYieldNote || r.attempts.some((a) => a.note))
    .sort((a, b) => b.score - a.score || (b.card.lastReviewAt?.getTime() ?? 0) - (a.card.lastReviewAt?.getTime() ?? 0) || a.card.id.localeCompare(b.card.id))
    .slice(0, maxCards);

  return rows.map(({ card, attempts }, i) => ({
    ref: `C${i + 1}`,
    id: card.id,
    title: clip(card.title, 160),
    topic: card.topicId ? clip(topicName.get(card.topicId), 160) : null,
    question: clip(card.questionLatex, 700) ?? "",
    ahaNote: clip(card.ahaNote, 600),
    teacherNote: clip(card.highYieldNote, 400),
    highYield: card.isHighYield,
    tags: input.cardTags
      .filter((l) => l.cardId === card.id)
      .map((l) => tagName.get(l.tagId))
      .filter((n): n is string => Boolean(n))
      .slice(0, 8)
      .map((n) => n.slice(0, 80)),
    state: card.state,
    lapses: card.lapses,
    attempts: attempts.slice(-maxAttempts).map((a) => ({ n: a.attemptNumber, rating: a.rating, date: isoDay(a.reviewedAt), note: clip(a.note, 600), variant: a.variantQuestionLatex !== null })),
  }));
}

/** T1…Tn refs for the tags usable in a subject, with usage counts inside that subject. */
export function buildTagDigest(input: { subjectId: string; tags: readonly AdaptiveTag[]; cards: readonly MistakeCard[]; cardTags: readonly MistakeCardTag[]; dictionary: Dictionary }): DigestTag[] {
  const subjectCards = new Set(input.cards.filter((c) => c.subjectId === input.subjectId).map((c) => c.id));
  return tagsForSubject(input.tags, input.subjectId)
    .slice(0, 40)
    .map((tag, i) => ({
      ref: `T${i + 1}`,
      id: tag.id,
      name: tagDisplayName(input.dictionary, tag).slice(0, 80),
      base: tag.origin === "BASE",
      uses: input.cardTags.filter((l) => l.tagId === tag.id && subjectCards.has(l.cardId)).length,
    }));
}

/** Sanitize insights coming from the editor / storage: trimmed, non-empty, capped. */
export function normalizeInsights(value: Partial<SubjectMemoryInsights> | null | undefined, maxEntries = 6): SubjectMemoryInsights {
  const list = (items: readonly string[] | undefined) => (items ?? []).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, maxEntries);
  return {
    overcome: list(value?.overcome),
    blindSpots: list(value?.blindSpots),
    thinkingPatterns: list(value?.thinkingPatterns),
    teacherEmphasis: list(value?.teacherEmphasis),
    nextFocus: list(value?.nextFocus),
  };
}

const clipList = (items: readonly string[] | undefined, maxItems: number, maxLen: number) =>
  (items ?? []).map((s) => s.trim().slice(0, maxLen)).filter(Boolean).slice(0, maxItems);

export interface BrainContext {
  subject: Pick<Subject, "id" | "name" | "description" | "memorySummary" | "memoryInsights" | "memoryVersion">;
  cards: readonly MistakeCard[];
  logs: readonly CardAttemptLog[];
  topics: readonly Topic[];
  tags: readonly AdaptiveTag[];
  cardTags: readonly MistakeCardTag[];
  persona: Pick<UserAiPersona, "summary" | "strengths" | "weaknesses" | "preferences"> | null;
  suggestions: readonly TagSuggestionFeedback[];
  dictionary: Dictionary;
}

function tagContext(ctx: BrainContext) {
  const tags = buildTagDigest({ subjectId: ctx.subject.id, tags: ctx.tags, cards: ctx.cards, cardTags: ctx.cardTags, dictionary: ctx.dictionary });
  const tagFeedback = (ctx.persona?.preferences?.tagFeedback ?? []).slice(0, 20).map((f) => ({
    kind: f.kind,
    proposedName: f.proposedName?.slice(0, 80) ?? null,
    reason: f.reason,
    detail: f.detail?.slice(0, 300) ?? null,
    subjectId: f.subjectId,
  }));
  // Every name already proposed for this subject (resolved or still pending) is off-limits.
  const resolvedNames = [...new Set(ctx.suggestions.filter((s) => s.subjectId === ctx.subject.id && s.proposedName).map((s) => s.proposedName!.slice(0, 80)))].slice(0, 40);
  return { tags, tagFeedback, resolvedNames };
}

/** Request body for "Re-sync AI Memory" (null when the subject has no cards yet). */
export function buildMemorySyncRequest(ctx: BrainContext, options: { suggestTags?: boolean; maxCards?: number } = {}): MemorySyncRequest | null {
  const cards = buildCardDigest({ ...ctx, subjectId: ctx.subject.id, options: { maxCards: options.maxCards ?? 60 } });
  if (cards.length === 0) return null;
  const insights = ctx.subject.memoryInsights;
  return {
    subjectId: ctx.subject.id,
    subject: { name: ctx.subject.name.slice(0, 120), description: ctx.subject.description?.slice(0, 400) ?? null },
    previousMemory: ctx.subject.memorySummary
      ? {
          summary: ctx.subject.memorySummary.slice(0, 4000),
          insights: insights
            ? {
                overcome: clipList(insights.overcome, 6, 320),
                blindSpots: clipList(insights.blindSpots, 6, 320),
                thinkingPatterns: clipList(insights.thinkingPatterns, 6, 320),
                teacherEmphasis: clipList(insights.teacherEmphasis, 6, 320),
                nextFocus: clipList(insights.nextFocus, 6, 320),
              }
            : null,
          version: ctx.subject.memoryVersion,
        }
      : null,
    persona: ctx.persona && (ctx.persona.summary || ctx.persona.strengths.length || ctx.persona.weaknesses.length)
      ? { summary: ctx.persona.summary.slice(0, 2400), strengths: clipList(ctx.persona.strengths, 8, 240), weaknesses: clipList(ctx.persona.weaknesses, 8, 240) }
      : null,
    totalCards: ctx.cards.filter((c) => c.subjectId === ctx.subject.id && c.archivedAt === null).length,
    cards,
    suggestTags: options.suggestTags ?? true,
    ...tagContext(ctx),
  };
}

/** Request body for standalone tag suggestions (null when no card carries a note to learn from). */
export function buildTagSuggestRequest(ctx: BrainContext, max = 2): TagSuggestRequest | null {
  const cards = buildCardDigest({ ...ctx, subjectId: ctx.subject.id, options: { maxCards: 40, withNotesOnly: true } });
  if (cards.length === 0) return null;
  return {
    subjectId: ctx.subject.id,
    subject: { name: ctx.subject.name.slice(0, 120), description: ctx.subject.description?.slice(0, 400) ?? null },
    memorySummary: ctx.subject.memorySummary?.slice(0, 4000) ?? null,
    cards,
    max,
    ...tagContext(ctx),
  };
}
