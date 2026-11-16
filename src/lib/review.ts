/**
 * Review — pure session logic (zero AI tokens). The review UI and the repository both go through here, so the buttons'
 * previewed intervals and the stored result always agree.
 *
 * Scheduling is tuned for LOGIC problems, not vocabulary: to test whether you can *solve* a problem again you must first
 * have forgotten its specific numbers, so there are no minutes-long learning steps. Each grade maps to a fixed number of
 * days (`REVIEW_INTERVAL_DAYS`). FSRS still runs underneath to keep stability / difficulty / lapses up to date (they feed
 * the weakness ranking and the "mastered" statistic), but it no longer decides when a card comes back.
 */
import { FSRS, RATINGS, type FsrsCard, type RatingName, type SchedulingResult } from "@/lib/fsrs";
import type { CardAttemptLog, MistakeCard, User } from "@/lib/repo/types";
import { startOfDay, timezoneOffsetMinutes } from "@/lib/stats";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/** Days until a problem returns, by grade: Quên 1, Khó 3, Nhớ 7, Dễ 14. */
export const REVIEW_INTERVAL_DAYS: Readonly<Record<RatingName, number>> = { AGAIN: 1, HARD: 3, GOOD: 7, EASY: 14 };

/** Learning cards due within this window are shown now (Anki-style "learn ahead"). Only cards graded before the
 *  day-based intervals existed can still be in a (re)learning step. */
export const LEARN_AHEAD_MINUTES = 20;

/** FSRS scheduler configured with the user's retention target and local day boundary at `at`. */
export function schedulerFor(user: Pick<User, "desiredRetention" | "timezone">, at: Date): FSRS {
  return new FSRS({ desiredRetention: user.desiredRetention, utcOffsetMinutes: timezoneOffsetMinutes(user.timezone, at) });
}

export function toFsrsCard(card: MistakeCard): FsrsCard {
  const { state, due, stability, difficulty, elapsedDays, scheduledDays, learningSteps, reps, lapses, lastReviewAt } = card;
  return { state, due, stability, difficulty, elapsedDays, scheduledDays, learningSteps, reps, lapses, lastReviewAt };
}

/**
 * Outcome of grading `card` with `rating` at `at`. Pure. FSRS updates the memory model (stability, difficulty, lapses,
 * reps); the return date and state come from `REVIEW_INTERVAL_DAYS`, and a graded card is always in the REVIEW state.
 */
export function scheduleReview(card: MistakeCard, rating: RatingName, at: Date, user: Pick<User, "desiredRetention" | "timezone">): SchedulingResult {
  const base = schedulerFor(user, at).next(toFsrsCard(card), at, rating);
  const days = REVIEW_INTERVAL_DAYS[rating];
  const due = new Date(at.getTime() + days * DAY_MS);
  return {
    card: { ...base.card, state: "REVIEW", due, scheduledDays: days, learningSteps: 0 },
    log: { ...base.log, stateAfter: "REVIEW", dueAfter: due, scheduledDays: days, learningSteps: 0 },
  };
}

/** Milliseconds until the card comes back, for each rating (the labels on the four buttons). */
export function previewIntervals(): Record<RatingName, number> {
  return Object.fromEntries(RATINGS.map((r) => [r, REVIEW_INTERVAL_DAYS[r] * DAY_MS])) as Record<RatingName, number>;
}

export type IntervalUnit = "minute" | "hour" | "day" | "month" | "year";

/** Human-sized interval: minutes < 1 h ≤ hours < 1 d ≤ days < 30 d ≤ months < 365 d ≤ years (1 decimal). */
export function intervalParts(ms: number): { unit: IntervalUnit; n: number } {
  const minutes = Math.max(1, Math.round(ms / MINUTE_MS));
  if (minutes < 60) return { unit: "minute", n: minutes };
  if (minutes < 24 * 60) return { unit: "hour", n: Math.round(minutes / 60) };
  const days = Math.round(ms / DAY_MS);
  if (days < 30) return { unit: "day", n: Math.max(1, days) };
  if (days < 365) return { unit: "month", n: Math.round((days / 30) * 10) / 10 };
  return { unit: "year", n: Math.round((days / 365) * 10) / 10 };
}

const isActive = (card: MistakeCard) => !card.isSuspended && card.archivedAt === null;
const isLearning = (card: MistakeCard) => card.state === "LEARNING" || card.state === "RELEARNING";

export interface ReviewQueue {
  /** Cards to study now, in order. */
  ready: MistakeCard[];
  /** (Re)learning cards that come back later today (short learning steps). */
  later: MistakeCard[];
  /** When the first `later` card becomes ready (null when there is none). */
  nextReadyAt: Date | null;
}

/**
 * Today's queue. NEW/REVIEW cards are ready when due before the end of the local day (overdue included);
 * (re)learning cards only once due within the learn-ahead window, because their steps are minutes long.
 * Order: problems marked "needs review" (not understood in class) first, then due (re)learning steps (they are time-sensitive),
 * then by due date, high-yield first on ties.
 */
export function buildReviewQueue(
  cards: readonly MistakeCard[],
  now: Date,
  options: { subjectId?: string | null; utcOffsetMinutes: number; learnAheadMinutes?: number },
): ReviewQueue {
  const endOfToday = startOfDay(now, options.utcOffsetMinutes).getTime() + DAY_MS;
  const horizon = now.getTime() + (options.learnAheadMinutes ?? LEARN_AHEAD_MINUTES) * MINUTE_MS;
  const ready: MistakeCard[] = [];
  const later: MistakeCard[] = [];
  for (const card of cards) {
    if (!isActive(card)) continue;
    if (options.subjectId && card.subjectId !== options.subjectId) continue;
    const due = card.due.getTime();
    if (due >= endOfToday) continue;
    if (isLearning(card) && due > horizon) later.push(card);
    else ready.push(card);
  }
  ready.sort(
    (a, b) =>
      Number(b.needsReview) - Number(a.needsReview) ||
      Number(isLearning(b) && b.due.getTime() <= now.getTime()) - Number(isLearning(a) && a.due.getTime() <= now.getTime()) ||
      a.due.getTime() - b.due.getTime() ||
      Number(b.isHighYield) - Number(a.isHighYield) ||
      a.id.localeCompare(b.id),
  );
  later.sort((a, b) => a.due.getTime() - b.due.getTime());
  return { ready, later, nextReadyAt: later[0] ? new Date(later[0].due.getTime() - (options.learnAheadMinutes ?? LEARN_AHEAD_MINUTES) * MINUTE_MS) : null };
}

/** Due-today counts per subject id (ready + later), for the arena's subject filter. */
export function dueCountsBySubject(cards: readonly MistakeCard[], now: Date, utcOffsetMinutes: number): Map<string, number> {
  const queue = buildReviewQueue(cards, now, { utcOffsetMinutes });
  const counts = new Map<string, number>();
  for (const card of [...queue.ready, ...queue.later]) counts.set(card.subjectId, (counts.get(card.subjectId) ?? 0) + 1);
  return counts;
}

/** A card's attempt history, oldest first ("Lần 1, Lần 2, Lần 3 …"). */
export function attemptHistory(cardId: string, logs: readonly CardAttemptLog[]): CardAttemptLog[] {
  return logs.filter((l) => l.cardId === cardId).sort((a, b) => a.attemptNumber - b.attemptNumber);
}

/** Normalise a reflection note: trimmed, collapsed blank lines, capped; empty → null. */
export function cleanNote(note: string | null | undefined, max = 2000): string | null {
  const text = (note ?? "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
  return text || null;
}
