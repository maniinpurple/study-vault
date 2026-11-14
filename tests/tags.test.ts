import { describe, expect, it } from "vitest";

import { getDictionary } from "@/lib/i18n";
import { formatDeclineReason, parseDeclineReason, rememberTagFeedback, resolvedSuggestionNames, sameTagName, tagDisplayName, tagFeedbackDirectives, tagsForSubject, uniqueSlug } from "@/lib/tags";
import type { TagFeedbackEntry, TagSuggestionFeedback } from "@/lib/repo/types";

import { T0, tag } from "./helpers/fixtures";

const entry = (patch: Partial<TagFeedbackEntry>): TagFeedbackEntry => ({ at: T0.toISOString(), subjectId: "s1", kind: "CREATE", proposedName: "X", reason: "too_specific", detail: null, ...patch });

describe("tag helpers", () => {
  it("shows base tags in the GUI language until renamed", () => {
    const base = tag("b", { i18nKey: "tags.base.stuck_approach", name: "Bí hướng giải" });
    expect(tagDisplayName(getDictionary("EN"), base)).toBe("Stuck on the approach");
    expect(tagDisplayName(getDictionary("VI"), base)).toBe("Bí hướng giải");
    expect(tagDisplayName(getDictionary("EN"), { ...base, i18nKey: null, name: "Bẫy paraphrase" })).toBe("Bẫy paraphrase");
  });
  it("lists only live tags of the subject plus global ones", () => {
    const tags = [tag("a"), tag("b", { subjectId: "s2" }), tag("g", { subjectId: null }), tag("x", { archivedAt: T0 }), tag("m", { mergedIntoId: "a" })];
    expect(tagsForSubject(tags, "s1").map((t) => t.id)).toEqual(["a", "g"]);
  });
  it("builds unique slugs and compares names loosely", () => {
    expect(uniqueSlug("Bẫy đề", ["bay-de", "bay-de-2"])).toBe("bay-de-3");
    expect(sameTagName("  Bẫy  ĐỀ ", "bẫy đề")).toBe(true);
    expect(sameTagName("Bẫy đề", "Bẫy đề số")).toBe(false);
  });
});

describe("decline feedback → Second Brain", () => {
  it("round-trips stored decline reasons", () => {
    expect(formatDeclineReason("too_specific")).toBe("too_specific");
    expect(formatDeclineReason("other", "  muốn   ngắn gọn ")).toBe("other: muốn ngắn gọn");
    expect(formatDeclineReason("other", " ")).toBe("other");
    expect(parseDeclineReason("other: muốn ngắn gọn")).toEqual({ reason: "other", detail: "muốn ngắn gọn" });
    expect(parseDeclineReason("not_my_intent")).toEqual({ reason: "not_my_intent", detail: null });
    expect(parseDeclineReason("legacy free text")).toEqual({ reason: "other", detail: "legacy free text" });
    expect(parseDeclineReason(null)).toBeNull();
  });
  it("remembers the most recent declines first, capped", () => {
    let prefs = null;
    for (let i = 0; i < 25; i++) prefs = rememberTagFeedback(prefs, entry({ proposedName: `T${i}` }));
    expect(prefs!.tagFeedback).toHaveLength(20);
    expect(prefs!.tagFeedback![0].proposedName).toBe("T24");
  });
  it("turns declines into prompt directives for the right subject", () => {
    const lines = tagFeedbackDirectives(
      [entry({ proposedName: "Quên đổi đơn vị km/h" }), entry({ reason: "not_my_intent", proposedName: "Lười" }), entry({ reason: "other", detail: "Tên phải ngắn" }), entry({ subjectId: "s9", proposedName: "Other subject" })],
      "s1",
    );
    expect(lines.join("\n")).toMatch(/TOO SPECIFIC.*Quên đổi đơn vị/);
    expect(lines.join("\n")).toMatch(/did NOT match.*Lười/);
    expect(lines.join("\n")).toContain("Tên phải ngắn");
    expect(lines.join("\n")).not.toContain("Other subject");
    expect(tagFeedbackDirectives([], "s1")).toEqual([]);
  });
  it("collects resolved suggestion names per subject", () => {
    const s = (patch: Partial<TagSuggestionFeedback>) => ({ subjectId: "s1", status: "REJECTED", proposedName: "A", ...patch }) as TagSuggestionFeedback;
    expect(resolvedSuggestionNames([s({}), s({ status: "PENDING", proposedName: "B" }), s({ subjectId: "s2", proposedName: "C" }), s({ status: "ACCEPTED", proposedName: "D" })], "s1")).toEqual(["A", "D"]);
  });
});
