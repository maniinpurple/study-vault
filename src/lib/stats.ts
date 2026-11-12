import type { CardAttemptLog, MistakeCard, Subject } from "@/lib/repo/types";

const DAY_MS = 86_400_000;

/** Start (UTC instant) of the calendar day containing `now` in a zone with the given UTC offset. */
export function startOfDay(now: Date, utcOffsetMinutes: number): Date {
  const shifted = now.getTime() + utcOffsetMinutes * 60_000;
  const dayStart = Math.floor(shifted / DAY_MS) * DAY_MS;
  return new Date(dayStart - utcOffsetMinutes * 60_000);
}

/** Offset (minutes east of UTC) of an IANA timezone at `at`; 0 if the zone is invalid. */
export function timezoneOffsetMinutes(timeZone: string, at: Date = new Date()): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(at);
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
  } catch {
    return 0;
  }
}

const isActive = (card: MistakeCard) => !card.isSuspended && card.archivedAt === null;

/** Cards whose due time falls on or before the end of today (overdue included). New cards count as due too. */
export function isDueToday(card: MistakeCard, now: Date, utcOffsetMinutes: number): boolean {
  if (!isActive(card)) return false;
  const endOfToday = startOfDay(now, utcOffsetMinutes).getTime() + DAY_MS;
  return card.due.getTime() < endOfToday;
}

export function countDueToday(cards: readonly MistakeCard[], now: Date, utcOffsetMinutes: number): number {
  return cards.filter((c) => isDueToday(c, now, utcOffsetMinutes)).length;
}

export interface RetentionResult {
  /** 0–1, or null when there are no reviews in the window. */
  rate: number | null;
  reviews: number;
}

/** True retention: share of non-NEW reviews in the last `days` days that were not rated AGAIN. */
export function computeRetention(logs: readonly CardAttemptLog[], now: Date, days = 30): RetentionResult {
  const since = now.getTime() - days * DAY_MS;
  const window = logs.filter((l) => l.reviewedAt.getTime() >= since && l.reviewedAt.getTime() <= now.getTime() && l.stateBefore !== "NEW");
  if (window.length === 0) return { rate: null, reviews: 0 };
  const recalled = window.filter((l) => l.rating !== "AGAIN").length;
  return { rate: recalled / window.length, reviews: window.length };
}

export interface DayActivity {
  /** Start of the day (UTC instant). */
  day: Date;
  reviews: number;
  recalled: number;
}

/** Review counts for each of the last `days` days, oldest → newest, ending with today. */
export function activityByDay(logs: readonly CardAttemptLog[], now: Date, utcOffsetMinutes: number, days = 14): DayActivity[] {
  const today = startOfDay(now, utcOffsetMinutes).getTime();
  const buckets: DayActivity[] = Array.from({ length: days }, (_, i) => ({
    day: new Date(today - (days - 1 - i) * DAY_MS),
    reviews: 0,
    recalled: 0,
  }));
  for (const log of logs) {
    const index = days - 1 - Math.floor((today + DAY_MS - 1 - log.reviewedAt.getTime()) / DAY_MS);
    const bucket = buckets[index];
    if (!bucket || index < 0) continue;
    bucket.reviews += 1;
    if (log.rating !== "AGAIN") bucket.recalled += 1;
  }
  return buckets;
}

export interface SubjectOverview {
  subject: Subject;
  totalCards: number;
  dueToday: number;
  highYield: number;
  /** Share of cards in REVIEW state with stability ≥ 21 days (0–1). */
  mastered: number;
  retention: RetentionResult;
  daysToExam: number | null;
}

export function subjectOverviews(
  subjects: readonly Subject[],
  cards: readonly MistakeCard[],
  logs: readonly CardAttemptLog[],
  now: Date,
  utcOffsetMinutes: number,
): SubjectOverview[] {
  const cardSubject = new Map(cards.map((c) => [c.id, c.subjectId]));
  const today = startOfDay(now, utcOffsetMinutes).getTime();
  return subjects
    .filter((s) => s.archivedAt === null)
    .map((subject) => {
      const own = cards.filter((c) => c.subjectId === subject.id && isActive(c));
      const ownLogs = logs.filter((l) => cardSubject.get(l.cardId) === subject.id);
      return {
        subject,
        totalCards: own.length,
        dueToday: countDueToday(own, now, utcOffsetMinutes),
        highYield: own.filter((c) => c.isHighYield).length,
        mastered: own.length === 0 ? 0 : own.filter((c) => c.state === "REVIEW" && c.stability >= 21).length / own.length,
        retention: computeRetention(ownLogs, now),
        daysToExam: subject.examDate ? Math.ceil((subject.examDate.getTime() - today) / DAY_MS) : null,
      };
    });
}

/** Consecutive days with ≥1 review, counting back from today (or from yesterday if today has none yet). */
export function reviewStreak(logs: readonly CardAttemptLog[], now: Date, utcOffsetMinutes: number): number {
  const activity = activityByDay(logs, now, utcOffsetMinutes, 366);
  let i = activity.length - 1;
  if (activity[i].reviews === 0) i -= 1;
  let streak = 0;
  while (i >= 0 && activity[i].reviews > 0) {
    streak += 1;
    i -= 1;
  }
  return streak;
}
