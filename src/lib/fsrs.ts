/**
 * Native FSRS-6 (Free Spaced Repetition Scheduler) — zero dependencies, zero AI tokens.
 *
 * Model reference: https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm
 * State machine follows py-fsrs / ts-fsrs (learning & relearning steps, short-term same-day reviews,
 * Hard ≤ Good < Easy interval ordering for review cards, deterministic fuzz).
 *
 * Field names deliberately match the Prisma `MistakeCard` and `CardAttemptLog` models so results can be
 * persisted without mapping. This module is isomorphic (safe on server and in the browser / local mode).
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type CardState = "NEW" | "LEARNING" | "REVIEW" | "RELEARNING";
export type RatingName = "AGAIN" | "HARD" | "GOOD" | "EASY";
export type Grade = 1 | 2 | 3 | 4;

export const RATINGS: readonly RatingName[] = ["AGAIN", "HARD", "GOOD", "EASY"];

const GRADE: Record<RatingName, Grade> = { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 };

export function ratingToGrade(rating: RatingName): Grade {
  return GRADE[rating];
}

export function gradeToRating(grade: Grade): RatingName {
  return RATINGS[grade - 1]!;
}

/** The FSRS scheduling fields of a card (subset of `MistakeCard`). */
export interface FsrsCard {
  state: CardState;
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  /** Index of the current (re)learning step. */
  learningSteps: number;
  reps: number;
  lapses: number;
  lastReviewAt: Date | null;
}

/** FSRS snapshot for one review (subset of `CardAttemptLog`). */
export interface FsrsReviewLog {
  rating: RatingName;
  reviewedAt: Date;
  stateBefore: CardState;
  stateAfter: CardState;
  stabilityBefore: number;
  stabilityAfter: number;
  difficultyBefore: number;
  difficultyAfter: number;
  /** Predicted recall probability at review time; null for NEW cards. */
  retrievability: number | null;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  dueBefore: Date;
  dueAfter: Date;
}

export interface SchedulingResult {
  card: FsrsCard;
  log: FsrsReviewLog;
}

export interface FsrsParameters {
  /** 21 FSRS-6 weights (19 FSRS-5 weights are also accepted and upgraded). */
  weights: readonly number[];
  /** Target probability of recall when a card comes due, in (0, 1). */
  desiredRetention: number;
  /** Upper bound for review intervals, in days. */
  maximumInterval: number;
  enableFuzz: boolean;
  /** Use the same-day (short-term) stability formula and learning steps. */
  enableShortTerm: boolean;
  /** Learning steps for new cards, in minutes. */
  learningSteps: readonly number[];
  /** Relearning steps after a lapse, in minutes. */
  relearningSteps: readonly number[];
  /**
   * Offset from UTC (minutes) used to decide day boundaries, e.g. 420 for Asia/Ho_Chi_Minh.
   * Two reviews on the same local calendar day count as `elapsedDays = 0`.
   */
  utcOffsetMinutes: number;
}

// ─── Defaults & constants ───────────────────────────────────────────────────

/** FSRS-6 default weights (trained on the open-spaced-repetition benchmark dataset). */
export const DEFAULT_WEIGHTS: readonly number[] = Object.freeze([
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614,
  0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
]);

export const DEFAULT_PARAMETERS: Readonly<FsrsParameters> = Object.freeze({
  weights: DEFAULT_WEIGHTS,
  desiredRetention: 0.9,
  maximumInterval: 36500,
  enableFuzz: true,
  enableShortTerm: true,
  learningSteps: Object.freeze([1, 10]),
  relearningSteps: Object.freeze([10]),
  utcOffsetMinutes: 0,
});

export const S_MIN = 0.001;
export const S_MAX = 36500;
const D_MIN = 1;
const D_MAX = 10;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

const FUZZ_RANGES = [
  { start: 2.5, end: 7, factor: 0.15 },
  { start: 7, end: 20, factor: 0.1 },
  { start: 20, end: Number.POSITIVE_INFINITY, factor: 0.05 },
] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * MINUTE_MS);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

/** Whole local-calendar days between two instants (never negative). */
export function calendarDaysBetween(from: Date, to: Date, utcOffsetMinutes = 0): number {
  const offset = utcOffsetMinutes * MINUTE_MS;
  const a = Math.floor((from.getTime() + offset) / DAY_MS);
  const b = Math.floor((to.getTime() + offset) / DAY_MS);
  return Math.max(0, b - a);
}

/** mulberry32 — tiny deterministic PRNG so previews and the real review produce the same fuzz. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(input: string): number {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Normalise user-supplied weights: [] → defaults, 19 (FSRS-5) → 21 (FSRS-6-equivalent). */
export function resolveWeights(weights: readonly number[] | null | undefined): readonly number[] {
  if (!weights || weights.length === 0) return DEFAULT_WEIGHTS;
  if (weights.some((w) => !Number.isFinite(w))) throw new RangeError("FSRS weights must be finite numbers");
  // FSRS-5 is FSRS-6 with w19 = 0 (no stability-dependent short-term damping) and w20 = 0.5 (decay).
  if (weights.length === 19) return Object.freeze([...weights, 0, 0.5]);
  if (weights.length === 21) return Object.freeze([...weights]);
  throw new RangeError(`FSRS expects 19 or 21 weights, received ${weights.length}`);
}

/** A brand-new card, due immediately. */
export function createEmptyCard(now: Date = new Date()): FsrsCard {
  return {
    state: "NEW",
    due: new Date(now.getTime()),
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    learningSteps: 0,
    reps: 0,
    lapses: 0,
    lastReviewAt: null,
  };
}

// ─── Scheduler ──────────────────────────────────────────────────────────────

interface Memory {
  stability: number;
  difficulty: number;
}

interface Outcome {
  state: CardState;
  step: number;
  memory: Memory;
  /** Minutes until due for (re)learning steps; null when scheduled in days. */
  stepMinutes: number | null;
  intervalDays: number;
}

export class FSRS {
  readonly params: Readonly<FsrsParameters>;
  private readonly w: readonly number[];
  private readonly decay: number;
  private readonly factor: number;
  private readonly random?: () => number;

  /**
   * @param params overrides for {@link DEFAULT_PARAMETERS}
   * @param random optional RNG for fuzz (defaults to a PRNG seeded from the card + review time,
   *               so `preview()` and `next()` always agree).
   */
  constructor(params: Partial<FsrsParameters> = {}, random?: () => number) {
    const merged: FsrsParameters = { ...DEFAULT_PARAMETERS, ...params };
    merged.weights = resolveWeights(params.weights);
    if (!(merged.desiredRetention > 0 && merged.desiredRetention < 1)) {
      throw new RangeError("desiredRetention must be in (0, 1)");
    }
    if (!(Number.isInteger(merged.maximumInterval) && merged.maximumInterval >= 1)) {
      throw new RangeError("maximumInterval must be a positive integer");
    }
    for (const step of [...merged.learningSteps, ...merged.relearningSteps]) {
      if (!(Number.isFinite(step) && step > 0)) throw new RangeError("Learning steps must be positive minutes");
    }
    this.params = Object.freeze(merged);
    this.w = merged.weights;
    this.decay = -this.w[20]!;
    this.factor = Math.pow(0.9, 1 / this.decay) - 1;
    this.random = random;
  }

  // ── Core model ──

  /** Probability of recall after `elapsedDays` with stability `stability`. */
  forgettingCurve(elapsedDays: number, stability: number): number {
    return Math.pow(1 + (this.factor * elapsedDays) / stability, this.decay);
  }

  private initStability(g: Grade): number {
    return Math.max(this.w[g - 1]!, 0.1);
  }

  private initDifficultyRaw(g: Grade): number {
    return this.w[4]! - Math.exp(this.w[5]! * (g - 1)) + 1;
  }

  private initDifficulty(g: Grade): number {
    return clamp(this.initDifficultyRaw(g), D_MIN, D_MAX);
  }

  private nextDifficulty(d: number, g: Grade): number {
    const delta = -this.w[6]! * (g - 3);
    const damped = d + (delta * (10 - d)) / 9; // linear damping
    const reverted = this.w[7]! * this.initDifficultyRaw(4) + (1 - this.w[7]!) * damped; // mean reversion
    return clamp(reverted, D_MIN, D_MAX);
  }

  private nextRecallStability(d: number, s: number, r: number, g: Grade): number {
    const hardPenalty = g === 2 ? this.w[15]! : 1;
    const easyBonus = g === 4 ? this.w[16]! : 1;
    const next =
      s *
      (1 +
        Math.exp(this.w[8]!) *
          (11 - d) *
          Math.pow(s, -this.w[9]!) *
          (Math.exp((1 - r) * this.w[10]!) - 1) *
          hardPenalty *
          easyBonus);
    return clamp(next, S_MIN, S_MAX);
  }

  private nextForgetStability(d: number, s: number, r: number): number {
    const longTerm =
      this.w[11]! *
      Math.pow(d, -this.w[12]!) *
      (Math.pow(s + 1, this.w[13]!) - 1) *
      Math.exp((1 - r) * this.w[14]!);
    const shortTerm = s / Math.exp(this.w[17]! * this.w[18]!);
    return clamp(Math.min(longTerm, shortTerm), S_MIN, S_MAX);
  }

  private nextShortTermStability(s: number, g: Grade): number {
    let increase = Math.exp(this.w[17]! * (g - 3 + this.w[18]!)) * Math.pow(s, -this.w[19]!);
    if (g >= 3) increase = Math.max(increase, 1);
    return clamp(s * increase, S_MIN, S_MAX);
  }

  private nextMemory(card: FsrsCard, elapsedDays: number, retrievability: number, g: Grade): Memory {
    if (card.state === "NEW" || card.stability <= 0) {
      return { stability: this.initStability(g), difficulty: this.initDifficulty(g) };
    }
    const difficulty = this.nextDifficulty(card.difficulty, g);
    if (this.params.enableShortTerm && elapsedDays < 1) {
      return { stability: this.nextShortTermStability(card.stability, g), difficulty };
    }
    const stability =
      g === 1
        ? this.nextForgetStability(card.difficulty, card.stability, retrievability)
        : this.nextRecallStability(card.difficulty, card.stability, retrievability, g);
    return { stability, difficulty };
  }

  /** Interval in whole days so that R(interval) ≈ desiredRetention. */
  nextInterval(stability: number): number {
    const raw = (stability / this.factor) * (Math.pow(this.params.desiredRetention, 1 / this.decay) - 1);
    return clamp(Math.round(raw), 1, this.params.maximumInterval);
  }

  private fuzz(intervalDays: number, rng: () => number): number {
    if (!this.params.enableFuzz || intervalDays < 2.5) return intervalDays;
    let delta = 1;
    for (const range of FUZZ_RANGES) {
      delta += range.factor * Math.max(Math.min(intervalDays, range.end) - range.start, 0);
    }
    const max = Math.min(Math.round(intervalDays + delta), this.params.maximumInterval);
    const min = Math.min(Math.max(2, Math.round(intervalDays - delta)), max);
    return Math.min(Math.floor(rng() * (max - min + 1) + min), this.params.maximumInterval);
  }

  private rngFor(card: FsrsCard, now: Date, g: Grade): () => number {
    if (this.random) return this.random;
    const seed = `${now.getTime()}|${card.reps}|${card.stability}|${card.difficulty}|${g}`;
    return mulberry32(hashString(seed));
  }

  /** Hard-step delay for (re)learning: 1.5× a lone step, the mean of the first two, or the current step. */
  private hardStepMinutes(steps: readonly number[], step: number): number {
    if (step === 0 && steps.length === 1) return steps[0]! * 1.5;
    if (step === 0 && steps.length >= 2) return (steps[0]! + steps[1]!) / 2;
    return steps[Math.min(step, steps.length - 1)]!;
  }

  private outcome(card: FsrsCard, now: Date, g: Grade, elapsedDays: number, r: number): Outcome {
    const memory = this.nextMemory(card, elapsedDays, r, g);
    const toReview = (): Outcome => ({
      state: "REVIEW",
      step: 0,
      memory,
      stepMinutes: null,
      intervalDays: this.fuzz(this.nextInterval(memory.stability), this.rngFor(card, now, g)),
    });

    if (card.state === "REVIEW") {
      if (g === 1) {
        const steps = this.params.enableShortTerm ? this.params.relearningSteps : [];
        if (steps.length === 0) return toReview();
        return { state: "RELEARNING", step: 0, memory, stepMinutes: steps[0]!, intervalDays: 0 };
      }
      return toReview();
    }

    // NEW, LEARNING, RELEARNING
    const steps = this.params.enableShortTerm
      ? card.state === "RELEARNING"
        ? this.params.relearningSteps
        : this.params.learningSteps
      : [];
    const step = card.state === "NEW" ? 0 : card.learningSteps;
    const learningState: CardState = card.state === "RELEARNING" ? "RELEARNING" : "LEARNING";

    if (steps.length === 0 || (step >= steps.length && g >= 2)) return toReview();

    switch (g) {
      case 1:
        return { state: learningState, step: 0, memory, stepMinutes: steps[0]!, intervalDays: 0 };
      case 2:
        return { state: learningState, step, memory, stepMinutes: this.hardStepMinutes(steps, step), intervalDays: 0 };
      case 3:
        if (step + 1 >= steps.length) return toReview();
        return { state: learningState, step: step + 1, memory, stepMinutes: steps[step + 1]!, intervalDays: 0 };
      case 4:
        return toReview();
    }
  }

  /** Compute the outcome of every rating at `now` (for the 4 answer buttons). */
  preview(card: FsrsCard, now: Date = new Date()): Record<RatingName, SchedulingResult> {
    const elapsedDays = card.lastReviewAt
      ? calendarDaysBetween(card.lastReviewAt, now, this.params.utcOffsetMinutes)
      : 0;
    const r = card.state === "NEW" || card.stability <= 0 ? 0 : this.forgettingCurve(elapsedDays, card.stability);

    const outcomes = ([1, 2, 3, 4] as const).map((g) => this.outcome(card, now, g, elapsedDays, r));
    const [again, hard, good, easy] = outcomes as [Outcome, Outcome, Outcome, Outcome];

    // Review cards: enforce Hard ≤ Good < Easy so the buttons are always monotonic.
    if (card.state === "REVIEW") {
      hard.intervalDays = Math.min(hard.intervalDays, good.intervalDays);
      good.intervalDays = Math.max(good.intervalDays, hard.intervalDays + 1);
      easy.intervalDays = Math.max(easy.intervalDays, good.intervalDays + 1);
      for (const o of [hard, good, easy]) o.intervalDays = Math.min(o.intervalDays, this.params.maximumInterval);
    }

    const build = (rating: RatingName, o: Outcome): SchedulingResult => {
      const due = o.stepMinutes !== null ? addMinutes(now, o.stepMinutes) : addDays(now, o.intervalDays);
      const next: FsrsCard = {
        state: o.state,
        due,
        stability: o.memory.stability,
        difficulty: o.memory.difficulty,
        elapsedDays,
        scheduledDays: o.stepMinutes !== null ? 0 : o.intervalDays,
        learningSteps: o.step,
        reps: card.reps + 1,
        lapses: card.lapses + (card.state === "REVIEW" && rating === "AGAIN" ? 1 : 0),
        lastReviewAt: new Date(now.getTime()),
      };
      return {
        card: next,
        log: {
          rating,
          reviewedAt: new Date(now.getTime()),
          stateBefore: card.state,
          stateAfter: next.state,
          stabilityBefore: card.stability,
          stabilityAfter: next.stability,
          difficultyBefore: card.difficulty,
          difficultyAfter: next.difficulty,
          retrievability: card.state === "NEW" ? null : r,
          elapsedDays,
          scheduledDays: next.scheduledDays,
          learningSteps: next.learningSteps,
          dueBefore: new Date(card.due.getTime()),
          dueAfter: due,
        },
      };
    };

    return { AGAIN: build("AGAIN", again), HARD: build("HARD", hard), GOOD: build("GOOD", good), EASY: build("EASY", easy) };
  }

  /** Apply one review. Pure: the input card is not mutated. */
  next(card: FsrsCard, now: Date, rating: RatingName): SchedulingResult {
    return this.preview(card, now)[rating];
  }

  /** Current probability of recall (fractional days), or null for cards never reviewed. */
  retrievability(card: FsrsCard, now: Date = new Date()): number | null {
    if (card.state === "NEW" || !card.lastReviewAt || card.stability <= 0) return null;
    const days = Math.max(0, (now.getTime() - card.lastReviewAt.getTime()) / DAY_MS);
    return this.forgettingCurve(days, card.stability);
  }
}
