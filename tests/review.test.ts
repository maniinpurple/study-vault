import { describe, expect, it } from "vitest";

import { attemptHistory, buildReviewQueue, cleanNote, dueCountsBySubject, intervalParts, previewIntervals, scheduleReview } from "@/lib/review";

import { card, daysFrom, log, T0 } from "./helpers/fixtures";

const VN = 420;
const user = { desiredRetention: 0.9, timezone: "Asia/Ho_Chi_Minh" };
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

describe("buildReviewQueue", () => {
  const cards = [
    card("new", { state: "NEW", due: T0 }),
    card("overdue", { state: "REVIEW", due: daysFrom(T0, -3), stability: 5, lastReviewAt: daysFrom(T0, -8) }),
    card("tonight", { state: "REVIEW", due: new Date("2026-11-12T16:30:00.000Z"), stability: 5, lastReviewAt: daysFrom(T0, -5) }), // 23:30 in Vietnam
    card("tomorrow", { state: "REVIEW", due: new Date("2026-11-12T17:30:00.000Z"), stability: 5, lastReviewAt: daysFrom(T0, -5) }), // 00:30 next day
    card("learning-now", { state: "LEARNING", due: minutes(-1) }),
    card("learning-soon", { state: "RELEARNING", due: minutes(15) }),
    card("learning-later", { state: "RELEARNING", due: minutes(90) }),
    card("suspended", { due: daysFrom(T0, -1), isSuspended: true }),
    card("other-subject", { subjectId: "s2", due: daysFrom(T0, -1), state: "REVIEW" }),
  ];

  it("splits ready cards from later-today learning steps using the local day boundary", () => {
    const q = buildReviewQueue(cards, T0, { utcOffsetMinutes: VN, subjectId: "s1" });
    expect(q.ready.map((c) => c.id)).toEqual(["learning-now", "overdue", "new", "learning-soon", "tonight"]);
    expect(q.later.map((c) => c.id)).toEqual(["learning-later"]);
    expect(q.nextReadyAt?.toISOString()).toBe(minutes(70).toISOString());
  });
  it("filters by subject and skips suspended / archived cards", () => {
    expect(buildReviewQueue(cards, T0, { utcOffsetMinutes: VN, subjectId: "s2" }).ready.map((c) => c.id)).toEqual(["other-subject"]);
    const all = buildReviewQueue(cards, T0, { utcOffsetMinutes: VN });
    expect(all.ready.some((c) => c.id === "suspended")).toBe(false);
    expect(dueCountsBySubject(cards, T0, VN)).toEqual(new Map([["s1", 6], ["s2", 1]]));
  });
  it("can study ahead by widening the learn-ahead window", () => {
    const q = buildReviewQueue(cards, T0, { utcOffsetMinutes: VN, subjectId: "s1", learnAheadMinutes: 24 * 60 });
    expect(q.later).toHaveLength(0);
    expect(q.ready.map((c) => c.id)).toContain("learning-later");
  });
  it("puts high-yield cards first among cards due at the same time", () => {
    const tie = [card("a", { due: T0 }), card("b", { due: T0, isHighYield: true })];
    expect(buildReviewQueue(tie, T0, { utcOffsetMinutes: 0 }).ready.map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("FSRS grading helpers", () => {
  const review = card("r", { state: "REVIEW", due: T0, stability: 10, difficulty: 5, reps: 4, lastReviewAt: daysFrom(T0, -10), scheduledDays: 10 });

  it("previews monotonic intervals and matches the stored outcome exactly", () => {
    const at = T0;
    const preview = previewIntervals(review, at, user);
    expect(preview.AGAIN).toBeLessThan(preview.HARD);
    expect(preview.HARD).toBeLessThanOrEqual(preview.GOOD);
    expect(preview.GOOD).toBeLessThan(preview.EASY);
    for (const rating of ["AGAIN", "HARD", "GOOD", "EASY"] as const) {
      const { card: next, log: fsrsLog } = scheduleReview(review, rating, at, user);
      expect(next.due.getTime() - at.getTime()).toBe(preview[rating]);
      expect(fsrsLog.rating).toBe(rating);
      expect(fsrsLog.dueBefore.getTime()).toBe(review.due.getTime());
    }
    expect(scheduleReview(review, "AGAIN", at, user).card.lapses).toBe(review.lapses + 1);
  });
  it("sends a failed new card into a minutes-long learning step", () => {
    const { card: next } = scheduleReview(card("n"), "AGAIN", T0, user);
    expect(next.state).toBe("LEARNING");
    expect(next.due.getTime() - T0.getTime()).toBe(60_000);
  });
});

describe("interval labels", () => {
  it("chooses a human-sized unit", () => {
    expect(intervalParts(30_000)).toEqual({ unit: "minute", n: 1 });
    expect(intervalParts(10 * 60_000)).toEqual({ unit: "minute", n: 10 });
    expect(intervalParts(3 * 3_600_000)).toEqual({ unit: "hour", n: 3 });
    expect(intervalParts(4 * 86_400_000)).toEqual({ unit: "day", n: 4 });
    expect(intervalParts(75 * 86_400_000)).toEqual({ unit: "month", n: 2.5 });
    expect(intervalParts(730 * 86_400_000)).toEqual({ unit: "year", n: 2 });
  });
});

describe("attempt history & notes", () => {
  it("returns a card's attempts oldest first (Lần 1, Lần 2 …)", () => {
    const logs = [log("c", 3), log("x", 1), log("c", 1), log("c", 2)];
    expect(attemptHistory("c", logs).map((l) => l.attemptNumber)).toEqual([1, 2, 3]);
  });
  it("normalises reflection notes", () => {
    expect(cleanNote("  \n\n ")).toBeNull();
    expect(cleanNote(undefined)).toBeNull();
    expect(cleanNote("a\r\n\r\n\r\n\r\nb")).toBe("a\n\nb");
    expect(cleanNote("x".repeat(3000))).toHaveLength(2000);
  });
});
