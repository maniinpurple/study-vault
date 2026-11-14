import { describe, expect, it } from "vitest";

import { BASE_TAGS } from "@/lib/constants";
import { getDictionary, resolveI18nKey } from "@/lib/i18n";
import { en } from "@/lib/i18n/dictionaries/en";
import { vi } from "@/lib/i18n/dictionaries/vi";

function entries(value: unknown, prefix = ""): [string, string][] {
  if (typeof value === "string") return [[prefix, value]];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => entries(v, prefix ? `${prefix}.${k}` : k));
}

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
// A Vietnamese label carrying its English gloss in parentheses, e.g. "Tách câu hỏi (Extract Questions)".
const ENGLISH_GLOSS = /\((?:[A-Z][a-z]+)(?: [A-Za-z]+)*\)/;

describe("dictionaries", () => {
  it("vi and en expose exactly the same keys", () => {
    expect(entries(en).map(([k]) => k).sort()).toEqual(entries(vi).map(([k]) => k).sort());
  });
  it("have no empty strings", () => {
    for (const dict of [vi, en]) for (const [path, text] of entries(dict)) expect(text, path).toBeTruthy();
  });
  it("use the same placeholders in both languages", () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const english = new Map(entries(en));
    for (const [path, text] of entries(vi)) expect(placeholders(english.get(path) ?? ""), path).toEqual(placeholders(text));
  });
  it("contain no emoji (DESIGN_SYSTEM.md §8.2)", () => {
    for (const dict of [vi, en]) for (const [path, text] of entries(dict)) expect(EMOJI.test(text), `${path}: ${text}`).toBe(false);
  });
  it("keep one language per Vietnamese string, with no shouting", () => {
    for (const [path, text] of entries(vi)) {
      expect(ENGLISH_GLOSS.test(text), `${path}: ${text}`).toBe(false);
      expect(text.includes("!"), `${path}: ${text}`).toBe(false);
    }
  });
  it("use the glossary terms", () => {
    expect(vi.review.ratings).toEqual({ AGAIN: "Quên", HARD: "Khó", GOOD: "Nhớ", EASY: "Dễ" });
    expect(en.review.ratings).toEqual({ AGAIN: "Again", HARD: "Hard", GOOD: "Good", EASY: "Easy" });
    expect(vi.review.attemptNo).toBe("Lần {n}");
    expect(vi.nav.vault).toBe("Kho câu hỏi");
    expect(vi.synth.experimentalBadge).toBe("Do AI tạo · Có thể có sai sót");
    expect(en.synth.experimentalBadge).toBe("AI-generated · May contain errors");
  });
});

describe("resolveI18nKey", () => {
  it("resolves every base tag key in both languages and rejects non-leaves", () => {
    for (const tag of BASE_TAGS) {
      expect(resolveI18nKey(getDictionary("VI"), tag.i18nKey)).toBe(vi.tags.base[tag.slug as keyof typeof vi.tags.base]);
      expect(resolveI18nKey(getDictionary("EN"), tag.i18nKey)).toBe(en.tags.base[tag.slug as keyof typeof en.tags.base]);
    }
    expect(resolveI18nKey(vi, "tags.base")).toBeNull();
    expect(resolveI18nKey(vi, "nope.nothing")).toBeNull();
  });
});
