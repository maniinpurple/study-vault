import { describe, expect, it } from "vitest";

import { buildPrompt, languageFinalReminder, languageSystemDirective, matchesLanguage, selectModel, TASK_TIER } from "@/lib/ai-prompt";
import { AI_PROVIDER_META, AI_PROVIDERS, slugify } from "@/lib/constants";

describe("selectModel", () => {
  it("routes light tasks to the light model even when the user picked a heavy default", () => {
    const key = { provider: "GEMINI", defaultModel: "gemini-3.8-pro", visionModel: null } as const;
    expect(selectModel("tag_suggestion", key)).toBe("gemini-3.8-flash");
    expect(selectModel("memory_sync", key)).toBe("gemini-3.8-flash");
  });
  it("keeps the user's heavy model for synthesis and the light model they chose for light tasks", () => {
    expect(selectModel("synthesis", { provider: "OPENAI", defaultModel: "gpt-4o", visionModel: null })).toBe("gpt-4o");
    expect(selectModel("tag_suggestion", { provider: "OPENAI", defaultModel: "gpt-4o-mini", visionModel: null })).toBe("gpt-4o-mini");
  });
  it("prefers the vision model for OCR, falling back to the default", () => {
    expect(selectModel("ocr", { provider: "ANTHROPIC", defaultModel: "claude-sonnet-5-5", visionModel: "claude-haiku-5-5" })).toBe("claude-haiku-5-5");
    expect(selectModel("ocr", { provider: "ANTHROPIC", defaultModel: "claude-sonnet-5-5", visionModel: null })).toBe("claude-sonnet-5-5");
  });
  it("always uses the configured model for CUSTOM providers and throws when none is set", () => {
    expect(selectModel("synthesis", { provider: "CUSTOM", defaultModel: "llama-3.3-70b", visionModel: null })).toBe("llama-3.3-70b");
    expect(selectModel("tag_suggestion", { provider: "CUSTOM", defaultModel: "llama-3.3-70b", visionModel: null })).toBe("llama-3.3-70b");
    expect(() => selectModel("synthesis", { provider: "CUSTOM", defaultModel: null, visionModel: null })).toThrow();
  });
  it("maps retired Gemini ids saved in older keys to their replacements, and never sends a models/ prefix", () => {
    const old = { provider: "GEMINI", defaultModel: "gemini-2.5-pro", visionModel: "gemini-2.5-flash" } as const;
    expect(selectModel("synthesis", old)).toBe("gemini-3.8-pro");
    expect(selectModel("ocr", old)).toBe("gemini-3.8-flash");
    expect(selectModel("ocr", { provider: "GEMINI", defaultModel: "models/gemini-3.8-flash", visionModel: null })).toBe("gemini-3.8-flash");
  });
  it("only synthesis is a heavy task", () => {
    expect(Object.entries(TASK_TIER).filter(([, tier]) => tier === "HEAVY").map(([task]) => task)).toEqual(["synthesis"]);
  });
});

describe("catalog", () => {
  it("has a light and a heavy model for every hosted provider", () => {
    for (const provider of AI_PROVIDERS.filter((p) => p !== "CUSTOM")) {
      const tiers = AI_PROVIDER_META[provider].models.map((m) => m.tier);
      expect(tiers).toContain("LIGHT");
      expect(tiers).toContain("HEAVY");
    }
  });
});

describe("language directives", () => {
  it("injects both a system directive and a final reminder", () => {
    const built = buildPrompt({ system: "You are a tutor.", prompt: "Explain.", language: "EN" });
    expect(built.system).toContain("You are a tutor.");
    expect(built.system).toBe(`You are a tutor.\n\n${languageSystemDirective("EN")}`);
    expect(built.prompt.endsWith(languageFinalReminder("EN"))).toBe(true);
    expect(languageSystemDirective("VI")).toContain("Vietnamese");
  });
});

describe("matchesLanguage", () => {
  const vi = "Hàm số đồng biến trên khoảng này vì đạo hàm luôn dương với mọi giá trị của tham số.";
  const en = "The function is increasing on this interval because the derivative is always positive.";
  it("detects Vietnamese vs English prose", () => {
    expect(matchesLanguage(vi, "VI")).toBe(true);
    expect(matchesLanguage(vi, "EN")).toBe(false);
    expect(matchesLanguage(en, "EN")).toBe(true);
    expect(matchesLanguage(en, "VI")).toBe(false);
  });
  it("ignores LaTeX and short text", () => {
    expect(matchesLanguage("$$\\int_0^1 x\\,dx = \\frac{1}{2}$$", "VI")).toBe(true);
    expect(matchesLanguage("ok", "VI")).toBe(true);
  });
});

describe("slugify", () => {
  it("strips Vietnamese diacritics", () => {
    expect(slugify("Toán TSA")).toBe("toan-tsa");
    expect(slugify("Đại số & Hình học")).toBe("dai-so-hinh-hoc");
    expect(slugify("!!!")).toBe("untitled");
  });
});
