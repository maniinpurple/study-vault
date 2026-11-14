import { describe, expect, it } from "vitest";

import {
  AiProvider, ExamPrepStatus, FileKind, Language, OcrStatus, Rating, SuggestionStatus, SynthesisMode, TagAssigner, TagOrigin, TagSuggestionKind, ThemePreference, UserRole,
} from "@/generated/prisma/enums";
import {
  AI_PROVIDERS, BASE_TAGS, EXAM_PREP_STATUSES, FILE_KINDS, LANGUAGES, OCR_STATUSES, SUGGESTION_STATUSES, SYNTHESIS_MODES, TAG_ASSIGNERS,
  TAG_ORIGINS, TAG_SUGGESTION_KINDS, THEMES, USER_ROLES, resolveAiOutputLanguage, tagScopeKey,
} from "@/lib/constants";
import { RATINGS } from "@/lib/fsrs";
import { en } from "@/lib/i18n/dictionaries/en";
import { vi } from "@/lib/i18n/dictionaries/vi";

describe("client enum mirrors", () => {
  it("match the Prisma schema", () => {
    expect([...LANGUAGES].sort()).toEqual(Object.values(Language).sort());
    expect([...THEMES].sort()).toEqual(Object.values(ThemePreference).sort());
    expect([...USER_ROLES].sort()).toEqual(Object.values(UserRole).sort());
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
    expect(BASE_TAGS.map((t) => t.name.VI)).toEqual(["Hổng kiến thức", "Đọc sai đề", "Bí hướng giải", "Tính toán sai"]);
    expect(BASE_TAGS.map((t) => vi.tags.base[t.slug as keyof typeof vi.tags.base])).toEqual(BASE_TAGS.map((t) => t.name.VI));
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
