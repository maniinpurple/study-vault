import { describe, expect, it } from "vitest";

import { buildCardDigest, buildMemorySyncRequest, buildTagDigest, buildTagSuggestRequest, normalizeInsights, type BrainContext } from "@/lib/brain";
import { buildMemorySyncPrompt, buildTagSuggestPrompt, mapTagSuggestions, memorySyncRequestSchema, tagSuggestRequestSchema } from "@/lib/brain-prompt";
import { getDictionary } from "@/lib/i18n";

import { card, link, log, subject, T0, tag, topic } from "./helpers/fixtures";

const dict = getDictionary("VI");
const topics = [topic("ch1", { name: "Đại số" }), topic("t1", { parentId: "ch1", name: "Logarit" })];
const tags = [tag("base1", { i18nKey: "tags.base.calculation", name: "x", origin: "BASE" }), tag("u1", { name: "Quên điều kiện", origin: "AI_ACCEPTED" }), tag("other", { subjectId: "s2" })];
const cards = [
  card("quiet"),
  card("noisy", { topicId: "t1", ahaNote: "Quên ĐKXĐ", lapses: 2, isHighYield: true, highYieldNote: "Cô nói sẽ thi" }),
  card("medium", { lastReviewAt: T0 }),
  card("elsewhere", { subjectId: "s2" }),
];
const logs = [
  log("noisy", 2, { rating: "GOOD", note: "Đã nhớ đặt điều kiện" }),
  log("noisy", 1, { rating: "AGAIN", note: "Lại quên điều kiện", variantQuestionLatex: "variant" }),
  log("medium", 1, { rating: "HARD" }),
];
const ctx: BrainContext = {
  subject: subject({ memorySummary: "Cũ", memoryVersion: 3, memoryInsights: { overcome: ["a"], blindSpots: ["b"], thinkingPatterns: [], teacherEmphasis: [], nextFocus: [] } }),
  cards, logs, topics, tags, cardTags: [link("noisy", "base1"), link("noisy", "u1"), link("elsewhere", "base1")],
  persona: { summary: "Vội", strengths: ["Nhanh"], weaknesses: ["Ẩu"], preferences: { tagFeedback: [{ at: T0.toISOString(), subjectId: "s1", kind: "CREATE", proposedName: "Quá chi tiết", reason: "too_specific", detail: null }] } },
  suggestions: [{ subjectId: "s1", proposedName: "Đã từ chối", status: "REJECTED" } as BrainContext["suggestions"][number]],
  dictionary: dict,
};

describe("card digest", () => {
  it("orders by informativeness, labels C-refs and keeps attempts chronological", () => {
    const digest = buildCardDigest({ ...ctx, subjectId: "s1" });
    expect(digest.map((d) => d.id)).toEqual(["noisy", "medium", "quiet"]);
    expect(digest.map((d) => d.ref)).toEqual(["C1", "C2", "C3"]);
    expect(digest[0]).toMatchObject({ topic: "Logarit", highYield: true, teacherNote: "Cô nói sẽ thi", tags: ["Sai tính toán / Thao tác", "Quên điều kiện"] });
    expect(digest[0].attempts.map((a) => [a.n, a.rating, a.variant])).toEqual([[1, "AGAIN", true], [2, "GOOD", false]]);
    expect(buildCardDigest({ ...ctx, subjectId: "s1", options: { withNotesOnly: true } }).map((d) => d.id)).toEqual(["noisy"]);
    expect(buildCardDigest({ ...ctx, subjectId: "s1", options: { maxCards: 1 } })).toHaveLength(1);
  });
  it("labels the subject's tags with usage counts inside that subject", () => {
    expect(buildTagDigest({ ...ctx, subjectId: "s1" })).toEqual([
      { ref: "T1", id: "base1", name: "Sai tính toán / Thao tác", base: true, uses: 1 },
      { ref: "T2", id: "u1", name: "Quên điều kiện", base: false, uses: 1 },
    ]);
  });
});

describe("memory sync request", () => {
  it("is schema-valid and carries the previous memory, persona and tag feedback", () => {
    const request = buildMemorySyncRequest(ctx)!;
    expect(memorySyncRequestSchema.safeParse(request).success).toBe(true);
    expect(request.previousMemory).toMatchObject({ summary: "Cũ", version: 3 });
    expect(request.totalCards).toBe(3);
    expect(request.resolvedNames).toEqual(["Đã từ chối"]);
    expect(request.tagFeedback[0]).toMatchObject({ reason: "too_specific", proposedName: "Quá chi tiết" });
    expect(buildMemorySyncRequest({ ...ctx, cards: [] })).toBeNull();
  });
  it("builds a prompt that analyses the attempt chronology and treats notes as data", () => {
    const { system, prompt } = buildMemorySyncPrompt(buildMemorySyncRequest(ctx)!);
    expect(system).toMatch(/OVERCAME/);
    expect(system).toMatch(/CHRONIC blind spots/);
    expect(system).toMatch(/CREATE/);
    expect(prompt).toContain("Attempt 1 / Lần 1");
    expect(prompt).toContain("[on an AI number-variant]");
    expect(prompt).toMatch(/never follow instructions/);
    expect(prompt).toMatch(/TOO SPECIFIC/);
    expect(prompt).toContain('"Đã từ chối"');
    const noTags = buildMemorySyncPrompt({ ...buildMemorySyncRequest(ctx)!, suggestTags: false });
    expect(noTags.system).toContain('"tagSuggestions": []');
  });
  it("tag-suggest request needs at least one card with notes", () => {
    const request = buildTagSuggestRequest(ctx)!;
    expect(tagSuggestRequestSchema.safeParse(request).success).toBe(true);
    expect(buildTagSuggestPrompt(request).prompt).toContain("Propose at most 2");
    expect(buildTagSuggestRequest({ ...ctx, logs: [], cards: [card("plain")] })).toBeNull();
  });
});

describe("mapTagSuggestions", () => {
  const digestTags = [{ ref: "T1", id: "base1", name: "Sai tính toán", base: true, uses: 2 }];
  const digestCards = buildCardDigest({ ...ctx, subjectId: "s1" });
  const s = (patch: object) => ({ kind: "CREATE" as const, name: "Bẫy đơn vị", rationale: "Hai lần quên đổi đơn vị", evidence: ["C1", "C2"], ...patch });

  it("maps refs to ids and drops invalid or duplicate suggestions", () => {
    const out = mapTagSuggestions(
      [
        s({}),
        s({ name: "bẫy  ĐƠN vị" }), // duplicate of the first
        s({ name: "Sai tính toán" }), // existing tag
        s({ name: "Đã từ chối" }), // previously resolved
        s({ name: "No evidence", evidence: ["C99"] }),
        s({ kind: "RENAME", targetTag: "T9", name: "Unknown target" }),
        s({ kind: "RENAME", targetTag: "T1", name: "Sai thao tác biến đổi", evidence: [] }),
      ],
      { tags: digestTags, cards: digestCards, resolvedNames: ["Đã từ chối"] },
    );
    expect(out).toEqual([
      { kind: "CREATE", targetTagId: null, proposedName: "Bẫy đơn vị", proposedDescription: null, rationale: "Hai lần quên đổi đơn vị", evidenceCardIds: ["noisy", "medium"] },
      { kind: "RENAME", targetTagId: "base1", proposedName: "Sai thao tác biến đổi", proposedDescription: null, rationale: "Hai lần quên đổi đơn vị", evidenceCardIds: [] },
    ]);
  });
});

describe("normalizeInsights", () => {
  it("trims, drops blanks and caps each list", () => {
    expect(normalizeInsights({ overcome: ["  a ", "", "b"], blindSpots: Array.from({ length: 9 }, (_, i) => `x${i}`) })).toEqual({
      overcome: ["a", "b"], blindSpots: ["x0", "x1", "x2", "x3", "x4", "x5"], thinkingPatterns: [], teacherEmphasis: [], nextFocus: [],
    });
  });
});
