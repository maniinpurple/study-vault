/**
 * Problem Vault — pure filtering, sorting and grouping. Groups carry keys/ids only; the UI resolves their labels.
 */
import { reviewStatus, REVIEW_STATUSES, type ReviewStatus } from "@/lib/problems";
import type { MistakeCard, MistakeCardTag } from "@/lib/repo/types";
import { startOfDay } from "@/lib/stats";

const DAY_MS = 86_400_000;

export const VAULT_GROUPS = ["time", "topic", "source", "tag", "status"] as const;
export type VaultGroup = (typeof VAULT_GROUPS)[number];
export const VAULT_SORTS = ["newest", "oldest", "dueSoon", "weakest"] as const;
export type VaultSort = (typeof VAULT_SORTS)[number];
export const TIME_BUCKETS = ["today", "yesterday", "thisWeek", "thisMonth", "earlier"] as const;
export type TimeBucket = (typeof TIME_BUCKETS)[number];

export interface VaultFilter {
  subjectId: string | null;
  query: string;
  priorityOnly: boolean;
  status: ReviewStatus | null;
}

export interface VaultContext {
  now: Date;
  utcOffsetMinutes: number;
  cardTags: readonly MistakeCardTag[];
}

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

/** Live problems matching the filter. The search ignores case and Vietnamese diacritics. */
export function filterProblems(cards: readonly MistakeCard[], filter: VaultFilter, ctx: VaultContext): MistakeCard[] {
  const needle = fold(filter.query.trim());
  return cards.filter((card) => {
    if (card.archivedAt !== null) return false;
    if (filter.subjectId && card.subjectId !== filter.subjectId) return false;
    if (filter.priorityOnly && !card.isHighYield) return false;
    if (filter.status && reviewStatus(card, ctx.now, ctx.utcOffsetMinutes) !== filter.status) return false;
    if (!needle) return true;
    return [card.title, card.questionLatex, card.solutionLatex, card.correctAnswerLatex, card.ahaNote, card.highYieldNote].some((field) => field && fold(field).includes(needle));
  });
}

export function sortProblems(cards: readonly MistakeCard[], sort: VaultSort): MistakeCard[] {
  const byNewest = (a: MistakeCard, b: MistakeCard) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id);
  const compare: Record<VaultSort, (a: MistakeCard, b: MistakeCard) => number> = {
    newest: byNewest,
    oldest: (a, b) => -byNewest(a, b),
    dueSoon: (a, b) => a.due.getTime() - b.due.getTime() || byNewest(a, b),
    weakest: (a, b) => b.lapses - a.lapses || b.difficulty - a.difficulty || byNewest(a, b),
  };
  return [...cards].sort(compare[sort]);
}

export function timeBucket(date: Date, now: Date, utcOffsetMinutes: number): TimeBucket {
  const today = startOfDay(now, utcOffsetMinutes).getTime();
  const t = date.getTime();
  if (t >= today) return "today";
  if (t >= today - DAY_MS) return "yesterday";
  if (t >= today - 7 * DAY_MS) return "thisWeek";
  if (t >= today - 30 * DAY_MS) return "thisMonth";
  return "earlier";
}

export interface ProblemGroup {
  /** Bucket name (time/status), an entity id (topic/source/tag), or null for "none". */
  key: string | null;
  cards: MistakeCard[];
}

/**
 * Split already-sorted problems into sections, keeping their order inside each section. Time and status sections follow
 * a fixed order; entity sections follow `order` (ids in display order) with the "none" section last. A problem with
 * several tags appears under each of them.
 */
export function groupProblems(cards: readonly MistakeCard[], group: VaultGroup, ctx: VaultContext, order: readonly string[] = []): ProblemGroup[] {
  const buckets = new Map<string | null, MistakeCard[]>();
  const push = (key: string | null, card: MistakeCard) => buckets.set(key, [...(buckets.get(key) ?? []), card]);
  const tagsByCard = new Map<string, string[]>();
  if (group === "tag") for (const link of ctx.cardTags) tagsByCard.set(link.cardId, [...(tagsByCard.get(link.cardId) ?? []), link.tagId]);

  for (const card of cards) {
    if (group === "time") push(timeBucket(card.createdAt, ctx.now, ctx.utcOffsetMinutes), card);
    else if (group === "status") push(reviewStatus(card, ctx.now, ctx.utcOffsetMinutes), card);
    else if (group === "topic") push(card.topicId, card);
    else if (group === "source") push(card.examUploadId, card);
    else {
      const tagIds = tagsByCard.get(card.id) ?? [];
      if (tagIds.length === 0) push(null, card);
      for (const tagId of tagIds) push(tagId, card);
    }
  }

  const fixed: readonly (string | null)[] = group === "time" ? TIME_BUCKETS : group === "status" ? REVIEW_STATUSES : [...order, ...[...buckets.keys()].filter((k) => k !== null && !order.includes(k)), null];
  return fixed.filter((key) => buckets.has(key)).map((key) => ({ key, cards: buckets.get(key)! }));
}
