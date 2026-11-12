import { describe, expect, it } from "vitest";

import { buildSynthesizeRequest, cardsInScope, expandTopicScope, pickMixSources, rankWeakCards, topicPath, weaknessScore } from "@/lib/lab";
import { synthesizeRequestSchema } from "@/lib/synth-prompt";

import { card, daysFrom, link, log, subject, T0, topic } from "./helpers/fixtures";

const topics = [
  topic("ch1", { name: "Đại số" }),
  topic("t1", { parentId: "ch1", name: "Hàm số" }),
  topic("t2", { parentId: "ch1", name: "Logarit" }),
  topic("ch2", { name: "Hình học" }),
  topic("t3", { parentId: "ch2", name: "Thể tích" }),
];

describe("exam scope", () => {
  const cards = [
    card("a", { topicId: "t1" }),
    card("b", { topicId: "t2", isHighYield: true }),
    card("c", { topicId: "t3" }),
    card("d", { topicId: null }),
    card("e", { topicId: "t1", subjectId: "s2" }),
    card("f", { topicId: "ch1" }),
  ];
  it("expands a chapter to its child topics", () => {
    expect([...expandTopicScope(["ch1"], topics)].sort()).toEqual(["ch1", "t1", "t2"]);
  });
  it("filters by subject, topics, tags and the high-yield flag", () => {
    const base = { subjectId: "s1", topicIds: [] as string[], tagIds: [] as string[], highYieldOnly: false };
    expect(cardsInScope(cards, base, topics, []).map((c) => c.id)).toEqual(["a", "b", "c", "d", "f"]);
    expect(cardsInScope(cards, { ...base, topicIds: ["ch1"] }, topics, []).map((c) => c.id)).toEqual(["a", "b", "f"]);
    expect(cardsInScope(cards, { ...base, topicIds: ["t3"] }, topics, []).map((c) => c.id)).toEqual(["c"]);
    expect(cardsInScope(cards, { ...base, highYieldOnly: true }, topics, []).map((c) => c.id)).toEqual(["b"]);
    expect(cardsInScope(cards, { ...base, tagIds: ["tg"] }, topics, [link("c", "tg"), link("e", "tg")]).map((c) => c.id)).toEqual(["c"]);
  });
  it("names topics as Chapter › Topic", () => {
    expect(topicPath("t2", topics)).toBe("Đại số › Logarit");
    expect(topicPath("ch2", topics)).toBe("Hình học");
    expect(topicPath(null, topics)).toBeNull();
  });
});

describe("weakness ranking & MIX source selection", () => {
  const strong = card("strong", { state: "REVIEW", stability: 60, difficulty: 2, lastReviewAt: daysFrom(T0, -1), topicId: "t1" });
  const weak = card("weak", { state: "REVIEW", stability: 2, difficulty: 8, lapses: 3, lastReviewAt: daysFrom(T0, -9), topicId: "t1" });
  const hy = card("hy", { state: "REVIEW", stability: 30, difficulty: 4, lastReviewAt: daysFrom(T0, -3), isHighYield: true, topicId: "t3" });
  const hy2 = card("hy2", { state: "REVIEW", stability: 30, difficulty: 4, lastReviewAt: daysFrom(T0, -3), isHighYield: true, topicId: "t3" });
  const logs = [log("weak", 1, { rating: "AGAIN" }), log("weak", 2, { rating: "AGAIN" }), log("strong", 1, { rating: "EASY" })];

  it("scores lapses, recent failures, low recall and difficulty as weakness", () => {
    expect(weaknessScore(weak, logs, T0)).toBeGreaterThan(weaknessScore(strong, logs, T0));
    expect(rankWeakCards([strong, weak], logs, T0)[0].card.id).toBe("weak");
  });
  it("prioritises high-yield cards and spreads the mix across topics", () => {
    const ranked = rankWeakCards([strong, weak, hy, hy2], logs, T0);
    const picked = pickMixSources(ranked, 3).map((c) => c.id);
    expect(picked).toHaveLength(3);
    expect(picked[0]).toMatch(/^hy/);
    // hy and hy2 share a topic: the second slot goes to another topic before reusing t3.
    expect(new Set(picked.slice(0, 2).map((id) => [strong, weak, hy, hy2].find((c) => c.id === id)!.topicId)).size).toBe(2);
    expect(pickMixSources(ranked, 7)).toHaveLength(3);
    expect(pickMixSources(ranked, 1)).toHaveLength(2);
  });
});

describe("buildSynthesizeRequest", () => {
  it("packs sources, scope and the Second Brain memory into a schema-valid request", () => {
    const sources = [
      card("a", { topicId: "t1", solutionLatex: "$x = 2$", correctAnswerLatex: "B", ahaNote: "Quên điều kiện", highYieldNote: "Cô nói chắc chắn thi", isHighYield: true }),
      card("b", { topicId: "t3" }),
    ];
    const request = buildSynthesizeRequest({
      mode: "MIX",
      subject: subject({ memorySummary: "Hay quên điều kiện xác định.", memoryInsights: { overcome: [], blindSpots: ["Điều kiện xác định"], thinkingPatterns: [], teacherEmphasis: [], nextFocus: ["Logarit"] } }),
      scopeTopicIds: ["ch1"],
      topics,
      sources,
      logs: [log("a", 1, { note: "Sai dấu" }), log("a", 2, { note: "Ổn hơn" }), log("b", 1)],
      persona: { summary: "Làm nhanh nhưng ẩu." },
    });
    expect(synthesizeRequestSchema.safeParse(request).success).toBe(true);
    expect(request.sources.map((s) => s.ref)).toEqual(["S1", "S2"]);
    expect(request.sources[0]).toMatchObject({ highYield: true, teacherNote: "Cô nói chắc chắn thi", notes: ["Sai dấu", "Ổn hơn"], topic: "Đại số › Hàm số" });
    expect(request.sources[0].solutionLatex).toBe("B\n\n$x = 2$");
    expect(request.scopeTopics).toEqual(["Đại số", "Đại số › Hàm số", "Đại số › Logarit"]);
    expect(request.memoryFocus).toEqual(["Điều kiện xác định", "Logarit"]);
    expect(request.personaSummary).toBe("Làm nhanh nhưng ẩu.");
  });
  it("is rejected when the source count does not match the mode", () => {
    const one = buildSynthesizeRequest({ mode: "MIX", subject: subject(), scopeTopicIds: [], topics, sources: [card("a")], logs: [], persona: null });
    expect(synthesizeRequestSchema.safeParse(one).success).toBe(false);
    expect(synthesizeRequestSchema.safeParse({ ...one, mode: "CLONE" }).success).toBe(true);
  });
});
