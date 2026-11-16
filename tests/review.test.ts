import { describe, expect, it } from "vitest";

import { attemptHistory, buildReviewQueue, cleanNote, dueCountsBySubject, intervalParts, previewIntervals, REVIEW_INTERVAL_DAYS, scheduleReview } from "@/lib/review";

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
  it("lists problems marked needs-review first, ahead of overdue and learning cards, within the chosen subject", () => {
    const flagged = [
      ...cards,
      card("not-understood", { state: "NEW", due: T0, needsReview: true, createdAt: daysFrom(T0, -1) }),
      card("not-understood-old", { state: "REVIEW", due: daysFrom(T0, -2), needsReview: true, stability: 5, lastReviewAt: daysFrom(T0, -9) }),
      card("not-understood-elsewhere", { subjectId: "s2", state: "NEW", due: T0, needsReview: true }),
    ];
    const q = buildReviewQueue(flagged, T0, { utcOffsetMinutes: VN, subjectId: "s1" });
    expect(q.ready.map((c) => c.id).slice(0, 2)).toEqual(["not-understood-old", "not-understood"]);
    expect(q.ready.map((c) => c.id)).not.toContain("not-understood-elsewhere");
    expect(q.ready.map((c) => c.id).slice(2)).toEqual(["learning-now", "overdue", "new", "learning-soon", "tonight"]);
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

describe("logic-problem grading intervals", () => {
  const review = card("r", { state: "REVIEW", due: T0, stability: 10, difficulty: 5, reps: 4, lastReviewAt: daysFrom(T0, -10), scheduledDays: 10 });
  const DAY = 86_400_000;

  it("uses fixed day intervals: Quên 1, Khó 3, Nhớ 7, Dễ 14", () => {
    expect(REVIEW_INTERVAL_DAYS).toEqual({ AGAIN: 1, HARD: 3, GOOD: 7, EASY: 14 });
    expect(previewIntervals()).toEqual({ AGAIN: DAY, HARD: 3 * DAY, GOOD: 7 * DAY, EASY: 14 * DAY });
  });
  it("stores exactly what the buttons preview, whatever the card's history", () => {
    const preview = previewIntervals();
    for (const base of [review, card("fresh"), card("relearning", { state: "RELEARNING", due: T0, stability: 1, lastReviewAt: daysFrom(T0, -1) })]) {
      for (const rating of ["AGAIN", "HARD", "GOOD", "EASY"] as const) {
        const { card: next, log: fsrsLog } = scheduleReview(base, rating, T0, user);
        expect(next.due.getTime() - T0.getTime()).toBe(preview[rating]);
        expect(fsrsLog.dueAfter.getTime()).toBe(next.due.getTime());
        expect(next.state).toBe("REVIEW"); // no minutes-long learning steps for logic problems
        expect(next.learningSteps).toBe(0);
        expect(next.scheduledDays).toBe(REVIEW_INTERVAL_DAYS[rating]);
        expect(fsrsLog).toMatchObject({ rating, stateAfter: "REVIEW", scheduledDays: REVIEW_INTERVAL_DAYS[rating] });
        expect(fsrsLog.dueBefore.getTime()).toBe(base.due.getTime());
      }
    }
  });
  it("still lets FSRS track lapses, and a failed NEW card comes back tomorrow, not in a minute", () => {
    expect(scheduleReview(review, "AGAIN", T0, user).card.lapses).toBe(review.lapses + 1);
    const { card: next } = scheduleReview(card("n"), "AGAIN", T0, user);
    expect(next.due.getTime() - T0.getTime()).toBe(DAY);
  });
  it("labels the intervals in whole days", () => {
    expect(Object.values(previewIntervals()).map((ms) => intervalParts(ms))).toEqual([
      { unit: "day", n: 1 }, { unit: "day", n: 3 }, { unit: "day", n: 7 }, { unit: "day", n: 14 },
    ]);
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
