/**
 * Scoped Exam Prep & AI Problem Synthesizer — pure scope filtering and source selection (no AI here).
 */
import { SYNTHESIS_MIX_MAX_SOURCES, SYNTHESIS_MIX_MIN_SOURCES, type SynthesisMode } from "@/lib/constants";
import { FSRS } from "@/lib/fsrs";
import type { CardAttemptLog, MistakeCard, MistakeCardTag, Subject, Topic, UserAiPersona } from "@/lib/repo/types";
import type { SynthesizeRequest } from "@/lib/synth-prompt";

export interface ExamScope {
  subjectId: string;
  /** Chapter and/or topic ids; a chapter covers its child topics. Empty = the whole subject. */
  topicIds: readonly string[];
  /** Error tags; a card matches if it carries any of them. Empty = no tag filter. */
  tagIds: readonly string[];
  highYieldOnly: boolean;
}

/** Topic ids covered by a selection: each chosen chapter expands to its children. */
export function expandTopicScope(topicIds: readonly string[], topics: readonly Topic[]): Set<string> {
  const chosen = new Set(topicIds);
  for (const topic of topics) if (topic.parentId && chosen.has(topic.parentId)) chosen.add(topic.id);
  return chosen;
}

export function cardsInScope(cards: readonly MistakeCard[], scope: ExamScope, topics: readonly Topic[], cardTags: readonly MistakeCardTag[]): MistakeCard[] {
  const topicSet = scope.topicIds.length > 0 ? expandTopicScope(scope.topicIds, topics) : null;
  const tagSet = scope.tagIds.length > 0 ? new Set(scope.tagIds) : null;
  const tagged = tagSet ? new Set(cardTags.filter((l) => tagSet.has(l.tagId)).map((l) => l.cardId)) : null;
  return cards.filter(
    (card) =>
      card.subjectId === scope.subjectId &&
      card.archivedAt === null &&
      (!topicSet || (card.topicId !== null && topicSet.has(card.topicId))) &&
      (!tagged || tagged.has(card.id)) &&
      (!scope.highYieldOnly || card.isHighYield),
  );
}

const scorer = new FSRS();

/**
 * How "weak" a card is (higher = more worth drilling): lapses, recent Again/Hard ratings, low current recall
 * probability and high FSRS difficulty, plus a bonus for teacher-flagged high-yield cards.
 */
export function weaknessScore(card: MistakeCard, logs: readonly CardAttemptLog[], now: Date): number {
  const recent = logs
    .filter((l) => l.cardId === card.id)
    .sort((a, b) => b.attemptNumber - a.attemptNumber)
    .slice(0, 5);
  const again = recent.filter((l) => l.rating === "AGAIN").length;
  const hard = recent.filter((l) => l.rating === "HARD").length;
  const recall = scorer.retrievability(card, now);
  let score = card.lapses * 1.5 + again * 2 + hard * 0.75 + (card.difficulty / 10) * 2;
  score += recall === null ? 1 : (1 - recall) * 3;
  if (card.isHighYield) score += 1.5;
  return Math.round(score * 100) / 100;
}

export interface RankedCard {
  card: MistakeCard;
  score: number;
}

export function rankWeakCards(cards: readonly MistakeCard[], logs: readonly CardAttemptLog[], now: Date): RankedCard[] {
  return cards
    .map((card) => ({ card, score: weaknessScore(card, logs, now) }))
    .sort((a, b) => b.score - a.score || a.card.id.localeCompare(b.card.id));
}

/**
 * Sources for a MIX (2–3 cards): high-yield cards first ("Cô nhấn mạnh"), then the weakest; prefers distinct topics so
 * the fused problem really combines concepts. Falls back to same-topic cards when the scope is narrow.
 */
export function pickMixSources(ranked: readonly RankedCard[], count: number): MistakeCard[] {
  const target = Math.min(Math.max(count, SYNTHESIS_MIX_MIN_SOURCES), SYNTHESIS_MIX_MAX_SOURCES);
  const ordered = [...ranked.filter((r) => r.card.isHighYield), ...ranked.filter((r) => !r.card.isHighYield)].map((r) => r.card);
  const picked: MistakeCard[] = [];
  const topics = new Set<string | null>();
  for (const card of ordered) {
    if (picked.length >= target) break;
    if (card.topicId !== null && topics.has(card.topicId)) continue;
    picked.push(card);
    topics.add(card.topicId);
  }
  for (const card of ordered) {
    if (picked.length >= target) break;
    if (!picked.includes(card)) picked.push(card);
  }
  return picked;
}

const clip = (value: string | null | undefined, max: number): string | null => {
  const text = (value ?? "").trim();
  return text ? text.slice(0, max) : null;
};

/** "Chapter › Topic" (or just the chapter) for prompts and lists. */
export function topicPath(topicId: string | null, topics: readonly Topic[]): string | null {
  const topic = topicId ? topics.find((t) => t.id === topicId) : undefined;
  if (!topic) return null;
  const parent = topic.parentId ? topics.find((t) => t.id === topic.parentId) : undefined;
  return parent ? `${parent.name} › ${topic.name}` : topic.name;
}

/**
 * Synthesizer request: sources (S1…S3) with their solutions, teacher/aha notes and recent attempt notes, the exam
 * scope, and the subject's Second Brain memory (summary + chronic blind spots + next focus) and global persona.
 */
export function buildSynthesizeRequest(input: {
  mode: SynthesisMode;
  subject: Pick<Subject, "name" | "description" | "memorySummary" | "memoryInsights">;
  scopeTopicIds: readonly string[];
  topics: readonly Topic[];
  sources: readonly MistakeCard[];
  logs: readonly CardAttemptLog[];
  persona: Pick<UserAiPersona, "summary"> | null;
}): SynthesizeRequest {
  const scope = expandTopicScope(input.scopeTopicIds, input.topics);
  const insights = input.subject.memoryInsights;
  return {
    mode: input.mode,
    subject: { name: input.subject.name.slice(0, 120), description: clip(input.subject.description, 400) },
    scopeTopics: input.topics
      .filter((t) => scope.has(t.id))
      .map((t) => topicPath(t.id, input.topics)!.slice(0, 160))
      .slice(0, 40),
    memorySummary: clip(input.subject.memorySummary, 4000),
    memoryFocus: [...(insights?.blindSpots ?? []), ...(insights?.nextFocus ?? [])].map((s) => s.slice(0, 320)).filter(Boolean).slice(0, 12),
    personaSummary: clip(input.persona?.summary, 2400),
    sources: input.sources.slice(0, SYNTHESIS_MIX_MAX_SOURCES).map((card, i) => ({
      ref: `S${i + 1}`,
      id: card.id,
      topic: topicPath(card.topicId, input.topics)?.slice(0, 160) ?? null,
      questionLatex: card.questionLatex.slice(0, 6000),
      solutionLatex: clip([card.correctAnswerLatex, card.solutionLatex].filter(Boolean).join("\n\n"), 6000),
      ahaNote: clip(card.ahaNote, 600),
      teacherNote: clip(card.highYieldNote, 600),
      highYield: card.isHighYield,
      notes: input.logs
        .filter((l) => l.cardId === card.id && l.note)
        .sort((a, b) => a.attemptNumber - b.attemptNumber)
        .slice(-6)
        .map((l) => l.note!.slice(0, 400)),
    })),
  };
}
