import { describe, expect, it } from "vitest";

import {
  AiProvider, ExamPrepStatus, FileKind, Language, OcrStatus, Rating, SuggestionStatus, SynthesisMode, TagAssigner, TagOrigin, TagSuggestionKind, ThemePreference,
} from "@/generated/prisma/enums";
import {
  AI_PROVIDERS, BASE_TAGS, baseTagId, EXAM_PREP_STATUSES, FILE_KINDS, LANGUAGES, OCR_STATUSES, RETIRED_BASE_TAG_SLUGS, SUGGESTION_STATUSES, SYNTHESIS_MODES, TAG_ASSIGNERS,
  TAG_ORIGINS, TAG_SUGGESTION_KINDS, THEMES, resolveAiOutputLanguage, tagScopeKey,
} from "@/lib/constants";
import { RATINGS } from "@/lib/fsrs";
import { en } from "@/lib/i18n/dictionaries/en";
import { vi } from "@/lib/i18n/dictionaries/vi";

describe("client enum mirrors", () => {
  it("match the Prisma schema", () => {
    expect([...LANGUAGES].sort()).toEqual(Object.values(Language).sort());
    expect([...THEMES].sort()).toEqual(Object.values(ThemePreference).sort());
    expect([...AI_PROVIDERS].sort()).toEqual(Object.values(AiProvider).sort());
    expect([...FILE_KINDS].sort()).toEqual(Object.values(FileKind).sort());
    expect([...OCR_STATUSES].sort()).toEqual(Object.values(OcrStatus).sort());
    expect([...TAG_ORIGINS].sort()).toEqual(Object.values(TagOrigin).sort());
    expect([...TAG_ASSIGNERS].sort()).toEqual(Object.values(TagAssigner).sort());
    expect([...TAG_SUGGESTION_KINDS].sort()).toEqual(Object.values(TagSuggestionKind).sort());
    expect([...SUGGESTION_STATUSES].sort()).toEqual(Object.values(SuggestionStatus).sort());
    expect([...SYNTHESIS_MODES].sort()).toEqual(Object.values(SynthesisMode).sort());
    expect([...EXAM_PREP_STATUSES].sort()).toEqual(Object.values(ExamPrepStatus).sort());
    expect([...RATINGS].sort()).toEqual(Object.values(Rating).sort());
  });
});

describe("base tags", () => {
  it("defines exactly four base tags, each with GUI translations in both languages", () => {
    expect(BASE_TAGS).toHaveLength(4);
    for (const tag of BASE_TAGS) {
      const slug = tag.slug as keyof typeof vi.tags.base;
      expect(tag.i18nKey).toBe(`tags.base.${tag.slug}`);
      expect(vi.tags.base[slug]).toBeTruthy();
      expect(en.tags.base[slug]).toBeTruthy();
    }
    expect(tagScopeKey(null)).toBe("global");
    expect(tagScopeKey("subject-1")).toBe("subject-1");
  });
  it("matches the Phase 4 spec: concept gap, skim/trap, stuck approach, calculation slip", () => {
    expect(BASE_TAGS.map((t) => t.name.VI)).toEqual(["Hổng kiến thức nền", "Đọc lướt / Bẫy đề", "Tắc hướng biến đổi", "Sai tính toán / Thao tác"]);
    expect(BASE_TAGS.map((t) => vi.tags.base[t.slug as keyof typeof vi.tags.base])).toEqual(BASE_TAGS.map((t) => t.name.VI));
    expect(baseTagId("subject-1", "misread")).toBe("tag-base-subject-1-misread");
    // A retired slug must fold into a live base tag.
    for (const target of Object.values(RETIRED_BASE_TAG_SLUGS)) expect(BASE_TAGS.some((t) => t.slug === target)).toBe(true);
  });
});

describe("AI output language resolution", () => {
  const user = { defaultAiOutputLanguage: "VI" as const };

  it("prefers subject, then API key, then user default", () => {
    expect(resolveAiOutputLanguage({ user })).toBe("VI");
    expect(resolveAiOutputLanguage({ user, apiKey: { aiOutputLanguage: "EN" } })).toBe("EN");
    expect(
      resolveAiOutputLanguage({ user, apiKey: { aiOutputLanguage: "EN" }, subject: { aiOutputLanguage: "VI" } }),
    ).toBe("VI");
    expect(resolveAiOutputLanguage({ user, apiKey: { aiOutputLanguage: null }, subject: { aiOutputLanguage: null } })).toBe(
      "VI",
    );
  });
});
