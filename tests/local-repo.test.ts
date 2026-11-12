/**
 * IndexedDB repository (local mode) against fake-indexeddb: Phase 4 operations and the v3 → v4 migration
 * (global base tags → per-subject base tags, retired `careless` folded into `calculation`).
 */
import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { openDB } from "idb";
import { beforeEach, describe, expect, it } from "vitest";

import { BASE_TAGS, baseTagId } from "@/lib/constants";
import { LocalRepository } from "@/lib/repo/local";

const MAIN = "local-minh-anh";

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

async function seeded() {
  const repo = new LocalRepository();
  await repo.init();
  const snap = (await repo.loadSnapshot(MAIN))!;
  return { repo, snap };
}

describe("LocalRepository · Phase 4", () => {
  it("seeds the four base tags for every subject (no global base tags)", async () => {
    const { snap } = await seeded();
    const base = snap.tags.filter((t) => t.origin === "BASE");
    expect(base).toHaveLength(snap.subjects.length * BASE_TAGS.length);
    expect(base.every((t) => t.subjectId !== null && t.scopeKey === t.subjectId)).toBe(true);
    expect(snap.persona).toBeNull();
    expect(snap.tagSuggestions).toEqual([]);
  });

  it("grades a card with FSRS, appends sequential attempts and marks the subject memory stale", async () => {
    const { repo, snap } = await seeded();
    const card = snap.cards.find((c) => c.state === "NEW")!;
    const at = new Date();
    const first = await repo.reviewCard(MAIN, { cardId: card.id, rating: "AGAIN", reviewedAt: at, note: "  Quên điều kiện  ", timeSpentMs: 41_234.6, variantQuestionLatex: "Biến thể" });
    const second = await repo.reviewCard(MAIN, { cardId: card.id, rating: "GOOD", reviewedAt: new Date(at.getTime() + 120_000) });
    expect([first.log.attemptNumber, second.log.attemptNumber]).toEqual([1, 2]);
    expect(first.log).toMatchObject({ note: "Quên điều kiện", timeSpentMs: 41_235, variantQuestionLatex: "Biến thể", rating: "AGAIN", stateBefore: "NEW", stateAfter: "LEARNING" });
    expect(second.card.attemptCount).toBe(2);
    const after = (await repo.loadSnapshot(MAIN))!;
    expect(after.logs.filter((l) => l.cardId === card.id).map((l) => l.attemptNumber).sort()).toEqual([1, 2]);
    expect(after.subjects.find((s) => s.id === card.subjectId)!.memoryStale).toBe(true);
    await expect(repo.reviewCard("someone-else", { cardId: card.id, rating: "GOOD", reviewedAt: at })).rejects.toThrow();
  });

  it("sets card tags within the subject only and keeps usage counts", async () => {
    const { repo, snap } = await seeded();
    const card = snap.cards[0];
    const own = baseTagId(card.subjectId, "misread");
    const foreign = snap.tags.find((t) => t.subjectId !== card.subjectId)!.id;
    await repo.setCardTags(MAIN, card.id, [own]);
    await expect(repo.setCardTags(MAIN, card.id, [foreign])).rejects.toThrow("Tag not found");
    let after = (await repo.loadSnapshot(MAIN))!;
    expect(after.cardTags.filter((l) => l.cardId === card.id).map((l) => l.tagId)).toEqual([own]);
    expect(after.tags.find((t) => t.id === own)!.usageCount).toBe(1);
    await repo.setCardTags(MAIN, card.id, []);
    after = (await repo.loadSnapshot(MAIN))!;
    expect(after.tags.find((t) => t.id === own)!.usageCount).toBe(0);
  });

  it("stores suggestions, applies accepted ones and remembers declines in the persona", async () => {
    const { repo, snap } = await seeded();
    const subject = snap.subjects.find((s) => s.userId === MAIN)!;
    const cards = snap.cards.filter((c) => c.subjectId === subject.id).slice(0, 2).map((c) => c.id);
    const meta = { aiProvider: "OPENAI" as const, aiModel: "gpt-4o-mini", outputLanguage: "VI" as const };
    const created = await repo.addTagSuggestions(MAIN, subject.id, [
      { kind: "CREATE", proposedName: "Bẫy đơn vị", rationale: "r", evidenceCardIds: [...cards, "not-a-card"], ...meta },
      { kind: "CREATE", proposedName: "Đọc lướt / Bẫy đề", rationale: "duplicate of a base tag", evidenceCardIds: cards, ...meta },
      { kind: "CREATE", proposedName: "Stuck on the approach", rationale: "duplicate of a base tag's translation", evidenceCardIds: cards, ...meta },
      { kind: "RENAME", targetTagId: baseTagId(subject.id, "stuck_approach"), proposedName: "Tắc hướng khảo sát hàm", rationale: "r", evidenceCardIds: [], ...meta },
      { kind: "RENAME", targetTagId: "missing", proposedName: "X", rationale: "r", evidenceCardIds: [], ...meta },
      { kind: "CREATE", proposedName: "Quá chi tiết", rationale: "r", evidenceCardIds: cards, ...meta },
    ]);
    expect(created.map((s) => s.proposedName)).toEqual(["Bẫy đơn vị", "Tắc hướng khảo sát hàm", "Quá chi tiết"]);
    expect(created[0].evidenceCardIds).toEqual(cards);

    const tag = await repo.acceptTagSuggestion(MAIN, created[0].id);
    expect(tag).toMatchObject({ subjectId: subject.id, origin: "AI_ACCEPTED", name: "Bẫy đơn vị", slug: "bay-don-vi", usageCount: 2 });
    const renamed = await repo.acceptTagSuggestion(MAIN, created[1].id);
    expect(renamed).toMatchObject({ id: baseTagId(subject.id, "stuck_approach"), name: "Tắc hướng khảo sát hàm", i18nKey: null, origin: "BASE" });
    await repo.rejectTagSuggestion(MAIN, created[2].id, "too_specific");
    await expect(repo.acceptTagSuggestion(MAIN, created[2].id)).rejects.toThrow("SUGGESTION_RESOLVED");

    const after = (await repo.loadSnapshot(MAIN))!;
    expect(after.cardTags.filter((l) => l.tagId === tag.id).map((l) => l.cardId).sort()).toEqual([...cards].sort());
    expect(after.tagSuggestions.find((s) => s.id === created[2].id)).toMatchObject({ status: "REJECTED", rejectionReason: "too_specific" });
    expect(after.persona?.preferences?.tagFeedback?.[0]).toMatchObject({ proposedName: "Quá chi tiết", reason: "too_specific", subjectId: subject.id });
    // Another subject keeps its own, untouched base tag.
    const other = after.subjects.find((s) => s.id !== subject.id && s.userId === MAIN)!;
    expect(after.tags.find((t) => t.id === baseTagId(other.id, "stuck_approach"))!.i18nKey).toBe("tags.base.stuck_approach");
    // A declined name is never stored again.
    expect(await repo.addTagSuggestions(MAIN, subject.id, [{ kind: "CREATE", proposedName: "quá  chi tiết", rationale: "r", evidenceCardIds: cards, ...meta }])).toEqual([]);
  });

  it("keeps at most three pending suggestions per subject", async () => {
    const { repo, snap } = await seeded();
    const subject = snap.subjects.find((s) => s.userId === MAIN)!;
    const meta = { aiProvider: null, aiModel: null, outputLanguage: "VI" as const };
    for (const name of ["A1", "A2", "A3", "A4", "A5"]) {
      await repo.addTagSuggestions(MAIN, subject.id, [{ kind: "CREATE", proposedName: name, rationale: "r", evidenceCardIds: [snap.cards[0].id], ...meta }]);
    }
    const after = (await repo.loadSnapshot(MAIN))!;
    const mine = after.tagSuggestions.filter((s) => s.subjectId === subject.id);
    expect(mine.filter((s) => s.status === "PENDING").map((s) => s.proposedName).sort()).toEqual(["A3", "A4", "A5"]);
    expect(mine.filter((s) => s.status === "EXPIRED")).toHaveLength(2);
  });

  it("saves memory + persona, and runs the synthesizer lifecycle with cascades", async () => {
    const { repo, snap } = await seeded();
    const subject = snap.subjects.find((s) => s.userId === MAIN)!;
    await repo.reviewCard(MAIN, { cardId: snap.cards.find((c) => c.subjectId === subject.id)!.id, rating: "GOOD", reviewedAt: new Date() });
    const saved = await repo.saveSubjectMemory(MAIN, subject.id, {
      memorySummary: " Hay quên ĐKXĐ. ", memoryInsights: { overcome: [" a "], blindSpots: [], thinkingPatterns: [], teacherEmphasis: [], nextFocus: [] }, source: "sync", memorySourceCardCount: 22,
    });
    expect(saved).toMatchObject({ memorySummary: "Hay quên ĐKXĐ.", memoryStale: false, memoryVersion: 1, memorySourceCardCount: 22 });
    expect(saved.memoryInsights?.overcome).toEqual(["a"]);
    const persona = await repo.updatePersona(MAIN, { summary: "Vội", strengths: ["Nhanh", " "], synced: true });
    expect(persona).toMatchObject({ summary: "Vội", strengths: ["Nhanh"], version: 1, isStale: false });

    const sources = snap.cards.filter((c) => c.subjectId === subject.id).slice(0, 2);
    const prep = await repo.createExamPrepSession(MAIN, { subjectId: subject.id, title: " Giữa kỳ ", topicIds: [sources[0].topicId ?? "x", "bogus"], highYieldOnly: true });
    expect(prep.title).toBe("Giữa kỳ");
    expect(prep.topicIds).not.toContain("bogus");
    await expect(repo.saveSynthesizedProblem(MAIN, { subjectId: subject.id, mode: "MIX", questionLatex: "Q", usedHighYield: false, outputLanguage: "VI", aiProvider: "OPENAI", aiModel: "m", promptVersion: "v", sourceCardIds: [sources[0].id] })).rejects.toThrow("INVALID_SOURCES");
    const problem = await repo.saveSynthesizedProblem(MAIN, {
      subjectId: subject.id, examPrepSessionId: prep.id, mode: "MIX", questionLatex: "Q", answerLatex: "A", solutionLatex: "S", verificationLatex: "V",
      usedHighYield: true, outputLanguage: "VI", aiProvider: "OPENAI", aiModel: "m", promptVersion: "v", sourceCardIds: sources.map((c) => c.id),
    });
    expect(problem).toMatchObject({ isExperimental: true, revision: 0 });
    const fixed = await repo.updateSynthesizedProblem(MAIN, problem.id, { answerLatex: "B", revised: true, isFlaggedIncorrect: false });
    expect(fixed).toMatchObject({ answerLatex: "B", revision: 1, isExperimental: true });
    const promoted = await repo.promoteSynthesizedProblem(MAIN, problem.id);
    expect(promoted).toMatchObject({ subjectId: subject.id, state: "NEW", questionLatex: "Q", correctAnswerLatex: "B", solutionLatex: "S" });
    expect((await repo.promoteSynthesizedProblem(MAIN, problem.id)).id).toBe(promoted.id);

    let after = (await repo.loadSnapshot(MAIN))!;
    expect(after.synthesisSources.filter((s) => s.problemId === problem.id).map((s) => s.position)).toEqual([0, 1]);
    await repo.deleteExamPrepSession(MAIN, prep.id);
    after = (await repo.loadSnapshot(MAIN))!;
    expect(after.synthesizedProblems.find((p) => p.id === problem.id)!.examPrepSessionId).toBeNull();

    await repo.deleteSubject(MAIN, subject.id);
    after = (await repo.loadSnapshot(MAIN))!;
    expect(after.synthesizedProblems.some((p) => p.subjectId === subject.id)).toBe(false);
    expect(after.synthesisSources).toHaveLength(0);
    expect(after.tags.some((t) => t.subjectId === subject.id)).toBe(false);
  });
});

describe("IndexedDB v3 → v4 migration", () => {
  it("moves global base tags to per-subject tags, folds `careless` into `calculation`, and backfills new fields", async () => {
    const now = new Date("2026-11-01T00:00:00.000Z");
    const v3 = await openDB("vaultlearn", 3, {
      upgrade(db) {
        db.createObjectStore("User", { keyPath: "id" });
        for (const name of ["UserApiKey", "Subject", "Topic", "MistakeCard", "CardAttemptLog", "ExamUpload", "AdaptiveTag"]) db.createObjectStore(name, { keyPath: "id" }).createIndex("userId", "userId");
        db.createObjectStore("StoredFile", { keyPath: "path" }).createIndex("userId", "userId");
        db.createObjectStore("MistakeCardTag", { keyPath: ["cardId", "tagId"] }).createIndex("cardId", "cardId");
        db.createObjectStore("Meta", { keyPath: "key" });
      },
    });
    const user = { id: "u", email: "u@x", displayName: "U", uiLanguage: "EN", defaultAiOutputLanguage: "VI", theme: "OBSIDIAN", timezone: "UTC", desiredRetention: 0.9, onboardedAt: now, lastActiveAt: now, createdAt: now, updatedAt: now };
    const subjectRow = (id: string) => ({ id, userId: "u", name: id, slug: id, description: null, color: null, icon: null, aiOutputLanguage: null, preferredApiKeyId: null, examDate: null, sortOrder: 0, memorySummary: null, memoryVersion: 0, memorySourceCardCount: 0, memoryStale: false, memoryUpdatedAt: null, archivedAt: null, createdAt: now, updatedAt: now });
    const cardRow = (id: string, subjectId: string) => ({ id, userId: "u", subjectId, topicId: null, questionLatex: "Q", state: "NEW", due: now, attemptCount: 0, archivedAt: null, isSuspended: false, createdAt: now, updatedAt: now });
    const globalTag = (slug: string) => ({ id: `tag-base-u-${slug}`, userId: "u", subjectId: null, scopeKey: "global", name: slug, slug, i18nKey: `tags.base.${slug}`, description: null, color: null, origin: "BASE", usageCount: 2, mergedIntoId: null, archivedAt: null, createdAt: now, updatedAt: now });
    const links = [
      ["c1", "careless"], ["c1", "calculation"], ["c1", "misread"], ["c2", "careless"], ["c3", "concept_gap"],
    ].map(([cardId, slug]) => ({ cardId, tagId: `tag-base-u-${slug}`, assignedBy: "USER", confidence: null, createdAt: now }));
    const tx = v3.transaction(["User", "Subject", "MistakeCard", "AdaptiveTag", "MistakeCardTag", "CardAttemptLog", "Meta"], "readwrite");
    await Promise.all([
      tx.objectStore("User").put(user),
      tx.objectStore("Subject").put(subjectRow("sa")),
      tx.objectStore("Subject").put(subjectRow("sb")),
      tx.objectStore("MistakeCard").put(cardRow("c1", "sa")),
      tx.objectStore("MistakeCard").put(cardRow("c2", "sb")),
      tx.objectStore("MistakeCard").put(cardRow("c3", "sb")),
      tx.objectStore("CardAttemptLog").put({ id: "l1", userId: "u", cardId: "c1", attemptNumber: 1, rating: "AGAIN", note: "n", reviewedAt: now }),
      tx.objectStore("Meta").put({ key: "seeded", value: "yes" }),
      ...["concept_gap", "careless", "misread", "calculation"].map((slug) => tx.objectStore("AdaptiveTag").put(globalTag(slug))),
      ...links.map((l) => tx.objectStore("MistakeCardTag").put(l)),
      tx.done,
    ]);
    v3.close();

    const snap = (await new LocalRepository().loadSnapshot("u"))!;
    expect(snap.tags.some((t) => t.subjectId === null)).toBe(false);
    expect(snap.tags).toHaveLength(8);
    const linksOf = (cardId: string) => snap.cardTags.filter((l) => l.cardId === cardId).map((l) => l.tagId).sort();
    expect(linksOf("c1")).toEqual([baseTagId("sa", "calculation"), baseTagId("sa", "misread")].sort());
    expect(linksOf("c2")).toEqual([baseTagId("sb", "calculation")]);
    expect(linksOf("c3")).toEqual([baseTagId("sb", "concept_gap")]);
    expect(snap.tags.find((t) => t.id === baseTagId("sa", "calculation"))).toMatchObject({ usageCount: 1, name: "Calculation / execution slip", scopeKey: "sa" });
    expect(snap.subjects.every((s) => s.memoryInsights === null)).toBe(true);
    expect(snap.logs[0]).toMatchObject({ variantQuestionLatex: null, timeSpentMs: null });
    expect(snap.synthesizedProblems).toEqual([]);
  });
});
