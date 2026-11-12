import { describe, expect, it } from "vitest";

import { defaultCardTitle, draftSaveProblem, groupTopics, mapWithConcurrency, pickOcrKey, scanAiLanguage } from "@/lib/scan-session";
import type { Topic, UserApiKey } from "@/lib/repo/types";

const key = (id: string, extra: Partial<UserApiKey> = {}) => ({ id, isActive: true, isDefault: false, aiOutputLanguage: null, ...extra }) as UserApiKey;

describe("pickOcrKey", () => {
  const keys = [key("a"), key("b", { isDefault: true }), key("c"), key("d", { isActive: false })];
  it("prefers the subject's key, then the default, then the first active key", () => {
    expect(pickOcrKey(keys, { preferredApiKeyId: "c" })?.id).toBe("c");
    expect(pickOcrKey(keys, { preferredApiKeyId: null })?.id).toBe("b");
    expect(pickOcrKey([key("a"), key("c")], null)?.id).toBe("a");
  });
  it("skips inactive keys, including an inactive preferred key", () => {
    expect(pickOcrKey(keys, { preferredApiKeyId: "d" })?.id).toBe("b");
    expect(pickOcrKey([key("d", { isActive: false })], null)).toBeNull();
    expect(pickOcrKey([], null)).toBeNull();
  });
});

describe("scanAiLanguage", () => {
  it("follows Subject → API key → account default", () => {
    const user = { defaultAiOutputLanguage: "VI" } as const;
    expect(scanAiLanguage(null, null, user)).toBe("VI");
    expect(scanAiLanguage(null, { aiOutputLanguage: "EN" }, user)).toBe("EN");
    expect(scanAiLanguage({ aiOutputLanguage: "VI" }, { aiOutputLanguage: "EN" }, user)).toBe("VI");
  });
});

describe("draftSaveProblem", () => {
  it("requires only question text and a subject — never a note", () => {
    expect(draftSaveProblem({ questionLatex: "  ", subjectId: "s" })).toBe("EMPTY_QUESTION");
    expect(draftSaveProblem({ questionLatex: "x", subjectId: null })).toBe("NO_SUBJECT");
    expect(draftSaveProblem({ questionLatex: "x", subjectId: "s" })).toBeNull();
  });
});

describe("defaultCardTitle", () => {
  it("includes the page only for multi-page files and strips the extension", () => {
    expect(defaultCardTitle("Midterm.pdf", 3, 2, 10)).toBe("Midterm · p.3 · Q2");
    expect(defaultCardTitle("IMG_2041.JPG", 1, 1, 1)).toBe("IMG_2041 · Q1");
  });
});

describe("groupTopics", () => {
  const topic = (id: string, subjectId: string, parentId: string | null) => ({ id, subjectId, parentId, name: id }) as Topic;
  it("groups leaf topics under chapters of the chosen subject", () => {
    const topics = [topic("c1", "s1", null), topic("t1", "s1", "c1"), topic("t2", "s1", "c1"), topic("c2", "s2", null), topic("t3", "s2", "c2")];
    expect(groupTopics(topics, "s1").map((g) => [g.chapter.id, g.children.map((c) => c.id)])).toEqual([["c1", ["t1", "t2"]]]);
    expect(groupTopics(topics, null)).toEqual([]);
  });
});

describe("mapWithConcurrency", () => {
  it("preserves order and never exceeds the limit", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapWithConcurrency([5, 1, 4, 2, 3, 0], 2, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, n));
      running--;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30, 0]);
    expect(peak).toBe(2);
    expect(await mapWithConcurrency([], 3, async (n: number) => n)).toEqual([]);
  });
});
