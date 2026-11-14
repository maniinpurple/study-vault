import { describe, expect, it } from "vitest";

import { buildDemoSeed } from "./helpers/sample-data";
import { activityByDay, computeRetention, countDueToday, reviewStreak, startOfDay, subjectOverviews, timezoneOffsetMinutes } from "@/lib/stats";
import { en } from "@/lib/i18n/dictionaries/en";
import { vi } from "@/lib/i18n/dictionaries/vi";
import { format } from "@/lib/i18n";

const NOW = new Date("2026-11-12T10:00:00.000Z");
const VN = 420;

describe("timezone helpers", () => {
  it("computes the Vietnam offset and day boundary", () => {
    expect(timezoneOffsetMinutes("Asia/Ho_Chi_Minh", NOW)).toBe(420);
    expect(timezoneOffsetMinutes("Not/AZone", NOW)).toBe(0);
    // 10:00Z is 17:00 on 12 Nov in Vietnam → the day started at 17:00Z on 11 Nov.
    expect(startOfDay(NOW, VN).toISOString()).toBe("2026-11-11T17:00:00.000Z");
    expect(startOfDay(NOW, 0).toISOString()).toBe("2026-11-12T00:00:00.000Z");
  });
});

describe("demo seed", () => {
  const seed = buildDemoSeed(NOW);
  const main = seed.users[0];

  it("is deterministic and relative to `now`", () => {
    expect(JSON.stringify(buildDemoSeed(NOW))).toBe(JSON.stringify(seed));
  });
  it("creates two accounts and the four demo subjects with topics", () => {
    expect(seed.users).toHaveLength(2);
    expect(seed.subjects.filter((s) => s.userId === main.id).map((s) => s.name)).toEqual(["Toán TSA", "Toán THPT", "Vật Lý", "IELTS / Tiếng Anh"]);
    expect(seed.topics.filter((t) => t.userId === main.id && t.parentId).length).toBeGreaterThan(8);
  });
  it("keeps every row owned by an existing user and referentially consistent", () => {
    const userIds = new Set(seed.users.map((u) => u.id));
    const cardIds = new Set(seed.cards.map((c) => c.id));
    const subjectIds = new Set(seed.subjects.map((s) => s.id));
    const topicIds = new Set(seed.topics.map((t) => t.id));
    for (const row of [...seed.subjects, ...seed.topics, ...seed.cards, ...seed.logs]) expect(userIds.has(row.userId)).toBe(true);
    for (const c of seed.cards) {
      expect(subjectIds.has(c.subjectId)).toBe(true);
      if (c.topicId) expect(topicIds.has(c.topicId)).toBe(true);
    }
    for (const l of seed.logs) expect(cardIds.has(l.cardId)).toBe(true);
    expect(new Set(seed.logs.map((l) => `${l.cardId}:${l.attemptNumber}`)).size).toBe(seed.logs.length);
  });
  it("keeps every card's attempt log chronological (Lần 1 never after Lần 2)", () => {
    const byCard = new Map<string, typeof seed.logs>();
    for (const l of seed.logs) byCard.set(l.cardId, [...(byCard.get(l.cardId) ?? []), l]);
    for (const logs of byCard.values()) {
      const ordered = [...logs].sort((a, b) => a.attemptNumber - b.attemptNumber);
      for (let i = 1; i < ordered.length; i++) expect(ordered[i].reviewedAt.getTime()).toBeGreaterThanOrEqual(ordered[i - 1].reviewedAt.getTime());
    }
    // Seeded cards carry worked solutions so the review "Reveal" has something to show.
    expect(seed.cards.every((c) => c.solutionLatex)).toBe(true);
  });
  it("gives the dashboard something to show", () => {
    const cards = seed.cards.filter((c) => c.userId === main.id);
    const due = countDueToday(cards, NOW, VN);
    expect(due).toBeGreaterThan(5);
    expect(due).toBeLessThan(cards.length);
    const retention = computeRetention(seed.logs, NOW, 30);
    expect(retention.reviews).toBeGreaterThan(20);
    expect(retention.rate).toBeGreaterThan(0.5);
    expect(retention.rate).toBeLessThan(1);
    expect(subjectOverviews(seed.subjects.filter((s) => s.userId === main.id), cards, seed.logs, NOW, VN)).toHaveLength(4);
  });
});

describe("stats", () => {
  const base = buildDemoSeed(NOW).logs[0];
  const log = (daysAgo: number, rating: "AGAIN" | "GOOD", stateBefore: "NEW" | "REVIEW" = "REVIEW") => ({ ...base, rating, stateBefore, reviewedAt: new Date(NOW.getTime() - daysAgo * 86_400_000) });

  it("excludes NEW first looks and out-of-window reviews from retention", () => {
    const logs = [log(1, "GOOD"), log(2, "GOOD"), log(3, "AGAIN"), log(4, "GOOD", "NEW"), log(40, "AGAIN")];
    expect(computeRetention(logs, NOW, 30)).toEqual({ rate: 2 / 3, reviews: 3 });
    expect(computeRetention([], NOW, 30)).toEqual({ rate: null, reviews: 0 });
  });
  it("buckets activity by local day, oldest first", () => {
    const logs = [log(0, "GOOD"), log(0, "AGAIN"), log(2, "GOOD")];
    const a = activityByDay(logs, NOW, VN, 3);
    expect(a.map((d) => d.reviews)).toEqual([1, 0, 2]);
    expect(a[2].recalled).toBe(1);
  });
  it("counts the streak from today, or yesterday when today is empty", () => {
    expect(reviewStreak([log(0, "GOOD"), log(1, "GOOD"), log(2, "GOOD"), log(4, "GOOD")], NOW, VN)).toBe(3);
    expect(reviewStreak([log(1, "GOOD"), log(2, "GOOD")], NOW, VN)).toBe(2);
    expect(reviewStreak([], NOW, VN)).toBe(0);
  });
});

describe("i18n", () => {
  const keys = (o: unknown, prefix = ""): string[] =>
    Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (typeof v === "object" && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]));
  it("has identical key sets in vi and en", () => {
    expect(keys(en).sort()).toEqual(keys(vi).sort());
  });
  it("formats placeholders", () => {
    expect(format("Hi {name}, {n} due", { name: "A", n: 3 })).toBe("Hi A, 3 due");
    expect(format("{missing}", {})).toBe("{missing}");
  });
});
