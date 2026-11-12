/**
 * Pure (client-safe) AI helpers: task → tier/model routing, language directives and drift detection.
 * The network adapter lives in `ai-provider.ts` (server-only).
 */
import { AI_PROVIDER_META, type AiModelTier, type AiProvider, type Language } from "@/lib/constants";

export const AI_TASKS = ["ocr", "tag_suggestion", "memory_sync", "mutation", "synthesis", "connection_test"] as const;
export type AiTask = (typeof AI_TASKS)[number];

/**
 * Lightweight tasks run on cheap/fast models; only problem synthesis (incl. "report & fix") uses the heavy tier.
 * `mutation` ("AI Đổi số liệu" during review) is light on purpose: it must feel instant mid-session.
 */
export const TASK_TIER: Record<AiTask, AiModelTier> = {
  ocr: "LIGHT",
  tag_suggestion: "LIGHT",
  memory_sync: "LIGHT",
  mutation: "LIGHT",
  connection_test: "LIGHT",
  synthesis: "HEAVY",
};

/**
 * How the output-language directive applies:
 * - `strict`: every natural-language word must be in the output language (memory, tags …).
 * - `verbatim`: transcription (OCR) — copied text keeps the document's language; only authored text is bound.
 * - `source`: problem generation — new problem statements keep the language of the source question(s) (an IELTS item
 *   stays English), while solutions, explanations and checks are written in the output language.
 */
export type LanguageMode = "strict" | "verbatim" | "source";

export interface ModelSelectionKey {
  provider: AiProvider;
  defaultModel: string | null;
  visionModel: string | null;
}

/**
 * Pick the model id for a task.
 * - OCR: the key's vision model, else its default model.
 * - Light tasks: the default model if it is light-tier, otherwise the provider's light model (saves tokens/cost).
 * - Heavy tasks: the default model (the user's choice), else the provider's heavy model.
 * CUSTOM providers have no catalog, so the configured model is always used.
 */
export function selectModel(task: AiTask, key: ModelSelectionKey): string {
  const meta = AI_PROVIDER_META[key.provider];
  const byTier = (tier: AiModelTier) => meta.models.find((m) => m.tier === tier)?.id;
  const configured = key.defaultModel ?? undefined;

  if (task === "ocr") {
    const model = key.visionModel ?? configured ?? byTier("LIGHT");
    if (model) return model;
  } else if (TASK_TIER[task] === "LIGHT") {
    const configuredTier = meta.models.find((m) => m.id === configured)?.tier;
    const model = configured && (configuredTier === "LIGHT" || meta.models.length === 0) ? configured : (byTier("LIGHT") ?? configured);
    if (model) return model;
  } else {
    const model = configured ?? byTier("HEAVY");
    if (model) return model;
  }
  throw new Error("No model configured for this API key");
}

const LANGUAGE_NAME: Record<Language, string> = { VI: "Vietnamese (Tiếng Việt)", EN: "English" };

export function languageName(language: Language): string {
  return LANGUAGE_NAME[language];
}

/**
 * Non-negotiable directive appended to the system prompt. LaTeX/math is language-neutral.
 * `verbatim` is for transcription tasks (OCR): text copied from the user's document keeps its own language, and the
 * directive binds only text the model authors itself.
 */
export function languageSystemDirective(language: Language, mode: LanguageMode | boolean = "strict"): string {
  const resolved: LanguageMode = mode === true ? "verbatim" : mode === false ? "strict" : mode;
  if (resolved === "source") {
    return [
      `OUTPUT LANGUAGE (NON-NEGOTIABLE): every solution, explanation, verification note and comment that you author must be in ${LANGUAGE_NAME[language]}.`,
      "Problem statements and answer options you write must stay in the SAME language as the source question(s) they are based on — never translate them. Mathematical notation and LaTeX are language-neutral and must stay unchanged.",
    ].join(" ");
  }
  if (resolved === "verbatim") {
    return [
      `OUTPUT LANGUAGE (NON-NEGOTIABLE): any natural-language text that YOU author (as opposed to text transcribed from the user's document) must be in ${LANGUAGE_NAME[language]}.`,
      "Transcribed text must stay verbatim in the document's original language — never translate it. Mathematical notation and LaTeX are language-neutral and must stay unchanged.",
    ].join(" ");
  }
  return [
    `OUTPUT LANGUAGE (NON-NEGOTIABLE): write every natural-language word of your answer in ${LANGUAGE_NAME[language]}.`,
    "Do not switch language, translate the user's content, or mix languages. Mathematical notation and LaTeX are language-neutral and must stay unchanged.",
  ].join(" ");
}

/** Final reminder line appended to the end of the user prompt. */
export function languageFinalReminder(language: Language): string {
  return `Reminder: respond ONLY in ${LANGUAGE_NAME[language]}.`;
}

/** Final reminder for transcription tasks: authored text only. */
export function verbatimFinalReminder(language: Language): string {
  return `Reminder: transcribed text stays in its original language; anything you author yourself is in ${LANGUAGE_NAME[language]}.`;
}

/** Final reminder for problem-generation tasks: problem text keeps the source language, everything authored is bound. */
export function sourceFinalReminder(language: Language): string {
  return `Reminder: problem statements keep the source question's language; solutions, explanations and checks are ONLY in ${LANGUAGE_NAME[language]}.`;
}

export function buildPrompt(input: { system?: string; prompt: string; language: Language; verbatim?: boolean; languageMode?: LanguageMode }): { system: string; prompt: string } {
  const mode: LanguageMode = input.verbatim ? "verbatim" : (input.languageMode ?? "strict");
  const reminder = mode === "verbatim" ? verbatimFinalReminder(input.language) : mode === "source" ? sourceFinalReminder(input.language) : languageFinalReminder(input.language);
  return {
    system: [input.system?.trim(), languageSystemDirective(input.language, mode)].filter(Boolean).join("\n\n"),
    prompt: `${input.prompt.trim()}\n\n${reminder}`,
  };
}

const VI_DIACRITICS = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/gi;

/** Strip LaTeX, code and URLs so only prose is inspected. */
function prose(text: string): string {
  return text
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]*\$/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/https?:\/\/\S+/g, " ");
}

/**
 * Heuristic check that `text` is written in `expected`. Returns true when there is too little prose to judge.
 * Vietnamese is detected by diacritic density; English by their near-absence.
 */
export function matchesLanguage(text: string, expected: Language): boolean {
  const body = prose(text);
  const letters = body.match(/\p{L}/gu)?.length ?? 0;
  if (letters < 24) return true;
  const ratio = (body.match(VI_DIACRITICS)?.length ?? 0) / letters;
  return expected === "VI" ? ratio >= 0.04 : ratio < 0.01;
}
