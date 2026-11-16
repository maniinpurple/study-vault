/**
 * Homework tracker for sources ("Đề thi"): due days, status and the three sort orders of the library. Pure.
 *
 * A deadline is a calendar day string, `YYYY-MM-DD`, exactly what the student picked: no time zone is involved when it is stored
 * or compared. "Today" is the student's own local day (their account time zone), so an assignment due today is still "today"
 * until their midnight.
 */

export const SOURCE_SORTS = ["deadline", "uploaded", "name", "subject", "status"] as const;
export type SourceSort = (typeof SOURCE_SORTS)[number];
export const DEFAULT_SOURCE_SORT: SourceSort = "deadline";

/** The details of a source that ordering and status need. */
export interface HomeworkItem {
  id: string;
  title: string;
  completed: boolean;
  deadline: string | null;
  createdAt: Date;
}

const DAY_MS = 86_400_000;
const dayNumber = (day: string) => Date.parse(`${day}T00:00:00.000Z`) / DAY_MS;

/** The calendar day (`YYYY-MM-DD`) of `now` in `timeZone`. */
export function todayIn(now: Date, timeZone: string): string {
  try {
    // The "sv-SE" locale formats dates as ISO year-month-day.
    return new Intl.DateTimeFormat("sv-SE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Whole days from `today` to `deadline`: negative when past. */
export const daysUntil = (deadline: string, today: string): number => Math.round(dayNumber(deadline) - dayNumber(today));

export type DeadlineState = { kind: "none" } | { kind: "done" } | { kind: "overdue"; days: number } | { kind: "today" } | { kind: "upcoming"; days: number; soon: boolean };

/** Where a source stands: finished, without a deadline, overdue by N days, due today, or due in N days (`soon` within 3). */
export function deadlineState(item: Pick<HomeworkItem, "completed" | "deadline">, today: string): DeadlineState {
  if (item.completed) return { kind: "done" };
  if (!item.deadline) return { kind: "none" };
  const days = daysUntil(item.deadline, today);
  if (days < 0) return { kind: "overdue", days: -days };
  if (days === 0) return { kind: "today" };
  return { kind: "upcoming", days, soon: days <= 3 };
}

const newestFirst = (a: HomeworkItem, b: HomeworkItem) => b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id);

/**
 * Order sources for the library.
 *  - `deadline` (default): closest due day first. Unfinished ones come before finished ones, and sources with no deadline are
 *    always last, newest upload first among themselves.
 *  - `uploaded`: newest first.
 *  - `name`: A–Z, accents and digits handled for `locale`.
 *  - `subject`: by subject name A–Z (needs `subjectName`); sources without a subject last.
 *  - `status`: unfinished before finished, then by deadline order.
 */
export function sortSources<T extends HomeworkItem>(items: readonly T[], sort: SourceSort, locale: string, subjectName: (item: T) => string | null = () => null): T[] {
  const list = [...items];
  if (sort === "uploaded") return list.sort(newestFirst);
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  if (sort === "name") return list.sort((a, b) => collator.compare(a.title, b.title) || newestFirst(a, b));
  if (sort === "subject") {
    return list.sort((a, b) => {
      const [sa, sb] = [subjectName(a), subjectName(b)];
      if ((sa === null) !== (sb === null)) return sa === null ? 1 : -1;
      return (sa !== null && sb !== null ? collator.compare(sa, sb) : 0) || collator.compare(a.title, b.title) || newestFirst(a, b);
    });
  }
  if (sort === "status") return sortSources(list, "deadline", locale).sort((a, b) => Number(a.completed) - Number(b.completed));
  return list.sort((a, b) => {
    if ((a.deadline === null) !== (b.deadline === null)) return a.deadline === null ? 1 : -1;
    if (a.deadline === null || b.deadline === null) return newestFirst(a, b);
    return Number(a.completed) - Number(b.completed) || a.deadline.localeCompare(b.deadline) || newestFirst(a, b);
  });
}
