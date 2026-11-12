import { describe, expect, it } from "vitest";

import {
  DEFAULT_WEIGHTS,
  FSRS,
  RATINGS,
  calendarDaysBetween,
  createEmptyCard,
  type FsrsCard,
  type RatingName,
} from "@/lib/fsrs";

const T0 = new Date("2026-01-01T08:00:00.000Z");
const MIN = 60_000;
const DAY = 86_400_000;

const noFuzz = new FSRS({ enableFuzz: false });

function reviewCard(overrides: Partial<FsrsCard> = {}): FsrsCard {
  return {
    ...createEmptyCard(T0),
    state: "REVIEW",
    stability: 10,
    difficulty: 5,
    reps: 5,
    scheduledDays: 10,
    lastReviewAt: T0,
    due: new Date(T0.getTime() + 10 * DAY),
    ...overrides,
  };
}

describe("FSRS-6 — new cards", () => {
  it("uses the initial stability/difficulty for each grade", () => {
    const card = createEmptyCard(T0);
    const p = noFuzz.preview(card, T0);
    expect(p.AGAIN.card.stability).toBeCloseTo(DEFAULT_WEIGHTS[0]!, 6);
    expect(p.HARD.card.stability).toBeCloseTo(DEFAULT_WEIGHTS[1]!, 6);
    expect(p.GOOD.card.stability).toBeCloseTo(DEFAULT_WEIGHTS[2]!, 6);
    expect(p.EASY.card.stability).toBeCloseTo(DEFAULT_WEIGHTS[3]!, 6);
    // D0(G) = w4 − e^(w5·(G−1)) + 1, clamped to [1, 10]
    expect(p.AGAIN.card.difficulty).toBeCloseTo(DEFAULT_WEIGHTS[4]!, 6);
    expect(p.GOOD.card.difficulty).toBeCloseTo(DEFAULT_WEIGHTS[4]! - Math.exp(DEFAULT_WEIGHTS[5]! * 2) + 1, 6);
    expect(p.EASY.card.difficulty).toBe(1);
  });

  it("walks the learning steps (1m, 10m)", () => {
    const card = createEmptyCard(T0);
    const p = noFuzz.preview(card, T0);

    expect(p.AGAIN.card).toMatchObject({ state: "LEARNING", learningSteps: 0, scheduledDays: 0 });
    expect(p.AGAIN.card.due.getTime() - T0.getTime()).toBe(1 * MIN);

    expect(p.HARD.card).toMatchObject({ state: "LEARNING", learningSteps: 0 });
    expect(p.HARD.card.due.getTime() - T0.getTime()).toBe(5.5 * MIN); // mean of first two steps

    expect(p.GOOD.card).toMatchObject({ state: "LEARNING", learningSteps: 1 });
    expect(p.GOOD.card.due.getTime() - T0.getTime()).toBe(10 * MIN);

    expect(p.EASY.card).toMatchObject({ state: "REVIEW", scheduledDays: 8 }); // round(w3 = 8.2956)
  });

  it("graduates from the last learning step to REVIEW", () => {
    const step1 = noFuzz.next(createEmptyCard(T0), T0, "GOOD").card;
    const later = new Date(T0.getTime() + 10 * MIN);
    const graduated = noFuzz.next(step1, later, "GOOD");
    expect(graduated.card.state).toBe("REVIEW");
    expect(graduated.card.scheduledDays).toBeGreaterThanOrEqual(1);
    expect(graduated.card.reps).toBe(2);
    expect(graduated.log.elapsedDays).toBe(0);
    expect(graduated.log.stateBefore).toBe("LEARNING");
  });

  it("skips learning steps when none are configured", () => {
    const fsrs = new FSRS({ enableFuzz: false, learningSteps: [] });
    const r = fsrs.next(createEmptyCard(T0), T0, "AGAIN");
    expect(r.card.state).toBe("REVIEW");
    expect(r.card.scheduledDays).toBeGreaterThanOrEqual(1);
  });
});

describe("FSRS-6 — review cards", () => {
  it("has R = 0.9 exactly at t = S (definition of stability)", () => {
    expect(noFuzz.forgettingCurve(10, 10)).toBeCloseTo(0.9, 10);
    const card = reviewCard();
    expect(noFuzz.retrievability(card, new Date(T0.getTime() + 10 * DAY))).toBeCloseTo(0.9, 10);
  });

  it("schedules interval ≈ S at desiredRetention = 0.9 and longer at lower retention", () => {
    expect(noFuzz.nextInterval(10)).toBe(10);
    expect(new FSRS({ desiredRetention: 0.8, enableFuzz: false }).nextInterval(10)).toBeGreaterThan(10);
    expect(new FSRS({ desiredRetention: 0.95, enableFuzz: false }).nextInterval(10)).toBeLessThan(10);
  });

  it("caps intervals at maximumInterval", () => {
    expect(new FSRS({ maximumInterval: 5, enableFuzz: false }).nextInterval(100)).toBe(5);
  });

  it("grows stability on recall and shrinks it on lapse", () => {
    const card = reviewCard();
    const now = new Date(T0.getTime() + 10 * DAY);
    const p = noFuzz.preview(card, now);

    expect(p.GOOD.card.stability).toBeGreaterThan(10);
    expect(p.EASY.card.stability).toBeGreaterThan(p.GOOD.card.stability);
    expect(p.HARD.card.stability).toBeLessThan(p.GOOD.card.stability);

    expect(p.AGAIN.card).toMatchObject({ state: "RELEARNING", learningSteps: 0, lapses: 1 });
    expect(p.AGAIN.card.stability).toBeLessThan(10);
    expect(p.AGAIN.card.due.getTime() - now.getTime()).toBe(10 * MIN);
  });

  it("keeps Hard ≤ Good < Easy intervals", () => {
    for (const elapsed of [0, 1, 3, 10, 40, 365]) {
      const now = new Date(T0.getTime() + elapsed * DAY);
      const p = new FSRS().preview(reviewCard(), now);
      expect(p.HARD.card.scheduledDays).toBeLessThanOrEqual(p.GOOD.card.scheduledDays);
      expect(p.GOOD.card.scheduledDays).toBeLessThan(p.EASY.card.scheduledDays);
    }
  });

  it("raises difficulty on AGAIN, lowers it on EASY, and stays within [1, 10]", () => {
    const now = new Date(T0.getTime() + 10 * DAY);
    const p = noFuzz.preview(reviewCard(), now);
    expect(p.AGAIN.card.difficulty).toBeGreaterThan(5);
    expect(p.EASY.card.difficulty).toBeLessThan(5);

    let hard = reviewCard();
    let easy = reviewCard();
    for (let i = 1; i <= 50; i++) {
      const at = new Date(T0.getTime() + i * 30 * DAY);
      hard = noFuzz.next({ ...hard, state: "REVIEW" }, at, "AGAIN").card;
      easy = noFuzz.next(easy, at, "EASY").card;
    }
    expect(hard.difficulty).toBeLessThanOrEqual(10);
    expect(hard.difficulty).toBeGreaterThan(9);
    expect(easy.difficulty).toBeGreaterThanOrEqual(1);
    expect(easy.difficulty).toBeLessThan(2);
  });

  it("returns to REVIEW after relearning", () => {
    const now = new Date(T0.getTime() + 10 * DAY);
    const lapsed = noFuzz.next(reviewCard(), now, "AGAIN").card;
    const relearned = noFuzz.next(lapsed, new Date(now.getTime() + 10 * MIN), "GOOD").card;
    expect(relearned.state).toBe("REVIEW");
    expect(relearned.lapses).toBe(1);
  });
});

describe("FSRS-6 — logs, purity, fuzz, config", () => {
  it("produces a complete CardAttemptLog snapshot", () => {
    const card = reviewCard();
    const now = new Date(T0.getTime() + 12 * DAY);
    const { card: next, log } = noFuzz.next(card, now, "GOOD");
    expect(log).toMatchObject({
      rating: "GOOD",
      stateBefore: "REVIEW",
      stateAfter: "REVIEW",
      stabilityBefore: 10,
      difficultyBefore: 5,
      stabilityAfter: next.stability,
      difficultyAfter: next.difficulty,
      elapsedDays: 12,
      scheduledDays: next.scheduledDays,
    });
    expect(log.retrievability).toBeCloseTo(noFuzz.forgettingCurve(12, 10), 10);
    expect(log.dueBefore).toEqual(card.due);
    expect(log.dueAfter).toEqual(next.due);
    expect(noFuzz.next(createEmptyCard(T0), T0, "GOOD").log.retrievability).toBeNull();
  });

  it("does not mutate the input card", () => {
    const card = reviewCard();
    const snapshot = structuredClone(card);
    noFuzz.next(card, new Date(T0.getTime() + 10 * DAY), "AGAIN");
    expect(card).toEqual(snapshot);
  });

  it("fuzz is deterministic (preview == next) and stays near the base interval", () => {
    const fsrs = new FSRS();
    const card = reviewCard({ stability: 30 });
    const now = new Date(T0.getTime() + 30 * DAY);
    const preview = fsrs.preview(card, now);
    for (const rating of RATINGS) {
      expect(fsrs.next(card, now, rating).card.due).toEqual(preview[rating].card.due);
    }
    const base = noFuzz.preview(card, now).GOOD.card.scheduledDays;
    const fuzzed = preview.GOOD.card.scheduledDays;
    expect(Math.abs(fuzzed - base)).toBeLessThanOrEqual(Math.ceil(base * 0.15) + 1);
  });

  it("accepts FSRS-5 (19) and FSRS-6 (21) weights and rejects others", () => {
    expect(() => new FSRS({ weights: DEFAULT_WEIGHTS.slice(0, 19) })).not.toThrow();
    expect(() => new FSRS({ weights: [...DEFAULT_WEIGHTS] })).not.toThrow();
    expect(() => new FSRS({ weights: DEFAULT_WEIGHTS.slice(0, 20) })).toThrow(RangeError);
    expect(() => new FSRS({ weights: [] })).not.toThrow(); // [] = defaults (DB column default)
    expect(() => new FSRS({ desiredRetention: 1 })).toThrow(RangeError);
    expect(() => new FSRS({ maximumInterval: 0 })).toThrow(RangeError);
  });

  it("counts calendar days in the user's timezone", () => {
    const lateEvening = new Date("2026-01-01T16:30:00Z"); // 23:30 in UTC+7
    const pastMidnight = new Date("2026-01-01T17:30:00Z"); // 00:30 next day in UTC+7
    expect(calendarDaysBetween(lateEvening, pastMidnight, 0)).toBe(0);
    expect(calendarDaysBetween(lateEvening, pastMidnight, 420)).toBe(1);
    expect(calendarDaysBetween(pastMidnight, lateEvening, 0)).toBe(0); // never negative
  });

  it("survives a long random review history without NaN and with due dates in the future", () => {
    let seed = 42;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const fsrs = new FSRS();
    let card = createEmptyCard(T0);
    let now = T0;
    for (let i = 0; i < 200; i++) {
      const rating: RatingName = RATINGS[Math.floor(rand() * 4)]!;
      const { card: next } = fsrs.next(card, now, rating);
      expect(Number.isFinite(next.stability)).toBe(true);
      expect(Number.isFinite(next.difficulty)).toBe(true);
      expect(next.due.getTime()).toBeGreaterThan(now.getTime());
      card = next;
      now = next.due;
    }
    expect(card.reps).toBe(200);
  });
});
