import "server-only";

/**
 * Server-side AI jobs for Phase 4. Each job builds its prompt from validated structured input (the browser can't
 * inject its own prompt), runs it through the user's decrypted key, and returns zod-validated, post-processed data.
 */
import { runAiJson, type AiCredential } from "@/lib/ai-provider";
import {
  buildMemorySyncPrompt, buildTagSuggestPrompt, mapTagSuggestions, memorySyncOutputSchema, tagSuggestOutputSchema,
  type MemorySyncRequest, type MemorySyncResponse, type TagSuggestRequest, type TagSuggestResponse,
} from "@/lib/brain-prompt";
import type { Language } from "@/lib/constants";
import { normalizeOcrMarkdown } from "@/lib/ocr-prompt";
import {
  analyzeOutputSchema, buildAnalyzePrompt, buildClassifyPrompt, classifyOutputSchema, type AnalyzeRequest, type AnalyzeResponse, type ClassifyRequest, type ClassifyResponse,
} from "@/lib/skills-prompt";
import {
  buildFixPrompt, buildMutatePrompt, buildSynthesizePrompt, fixOutputSchema, formatVerification, mutateOutputSchema, mutationProblem, synthesisProblem,
  synthesizeOutputSchema, type FixRequest, type FixResponse, type MutateRequest, type MutateResponse, type SynthesizeRequest, type SynthesizeResponse,
} from "@/lib/synth-prompt";

/** Model Markdown → the app's LaTeX conventions ($ / $$, no fences). */
const tidy = (s: string) => normalizeOcrMarkdown(s);

export async function runMemorySync(credential: AiCredential, language: Language, input: MemorySyncRequest, fetchImpl?: typeof fetch): Promise<MemorySyncResponse> {
  const { system, prompt } = buildMemorySyncPrompt(input);
  const result = await runAiJson(credential, { task: "memory_sync", system, prompt, language, maxOutputTokens: 3000 }, memorySyncOutputSchema, fetchImpl);
  const { data } = result;
  return {
    summary: tidy(data.summary),
    insights: data.insights,
    persona: data.persona,
    tagSuggestions: input.suggestTags ? mapTagSuggestions(data.tagSuggestions, { tags: input.tags, cards: input.cards, resolvedNames: input.resolvedNames }, 2) : [],
    model: result.model,
  };
}

export async function runTagSuggest(credential: AiCredential, language: Language, input: TagSuggestRequest, fetchImpl?: typeof fetch): Promise<TagSuggestResponse> {
  const { system, prompt } = buildTagSuggestPrompt(input);
  const result = await runAiJson(credential, { task: "tag_suggestion", system, prompt, language, maxOutputTokens: 1200 }, tagSuggestOutputSchema, fetchImpl, {
    // An empty list is valid and has no prose to check.
    languageText: (d) => d.suggestions.map((s) => `${s.name} ${s.rationale} ${s.description ?? ""}`).join(" "),
  });
  return {
    suggestions: mapTagSuggestions(result.data.suggestions, { tags: input.tags, cards: input.cards, resolvedNames: input.resolvedNames }, input.max),
    model: result.model,
  };
}

export async function runMutation(credential: AiCredential, language: Language, input: MutateRequest, fetchImpl?: typeof fetch): Promise<MutateResponse> {
  const { system, prompt } = buildMutatePrompt(input);
  const result = await runAiJson(
    credential,
    { task: "mutation", system, prompt, language, languageMode: "source", maxOutputTokens: 4000 },
    mutateOutputSchema,
    fetchImpl,
    { languageText: (d) => `${d.solutionLatex} ${d.changes}`, validate: (d) => mutationProblem(d, input) },
  );
  const { data } = result;
  return { questionLatex: tidy(data.questionLatex), answerLatex: tidy(data.answerLatex), solutionLatex: tidy(data.solutionLatex), changes: data.changes, model: result.model };
}

export async function runSynthesis(credential: AiCredential, language: Language, input: SynthesizeRequest, fetchImpl?: typeof fetch): Promise<SynthesizeResponse> {
  const { system, prompt } = buildSynthesizePrompt(input);
  const result = await runAiJson(
    credential,
    { task: "synthesis", system, prompt, language, languageMode: "source", maxOutputTokens: 8000 },
    synthesizeOutputSchema,
    fetchImpl,
    { languageText: (d) => `${d.solutionLatex} ${d.verification.method} ${d.verification.workLatex}`, validate: synthesisProblem },
  );
  const { data } = result;
  return {
    questionLatex: tidy(data.questionLatex),
    answerLatex: tidy(data.answerLatex),
    solutionLatex: tidy(data.solutionLatex),
    verificationLatex: tidy(formatVerification(data.verification)),
    diagramDescription: data.diagramDescription?.trim() || null,
    difficultyEstimate: Math.round(data.difficulty * 10) / 10,
    conceptsUsed: data.conceptsUsed,
    model: result.model,
  };
}

export async function runSynthesisFix(credential: AiCredential, language: Language, input: FixRequest, fetchImpl?: typeof fetch): Promise<FixResponse> {
  const { system, prompt } = buildFixPrompt(input);
  const result = await runAiJson(
    credential,
    { task: "synthesis", system, prompt, language, languageMode: "source", maxOutputTokens: 8000 },
    fixOutputSchema,
    fetchImpl,
    { languageText: (d) => `${d.explanation} ${d.solutionLatex} ${d.verification.method}`, validate: synthesisProblem },
  );
  const { data } = result;
  return {
    verdict: data.verdict,
    explanation: data.explanation,
    questionLatex: tidy(data.questionLatex),
    answerLatex: tidy(data.answerLatex),
    solutionLatex: tidy(data.solutionLatex),
    verificationLatex: tidy(formatVerification(data.verification)),
    model: result.model,
  };
}

/** Upload dialog: the first page → the document's own title and its subject. Both are copied from the page, so no language check. */
export async function runClassify(credential: AiCredential, language: Language, input: ClassifyRequest, fetchImpl?: typeof fetch): Promise<ClassifyResponse> {
  const { system, prompt } = buildClassifyPrompt(input);
  const result = await runAiJson(credential, { task: "classify", system, prompt, language, images: [input.image], verbatim: true, maxOutputTokens: 400 }, classifyOutputSchema, fetchImpl, { languageText: () => "" });
  return { title: result.data.title, subject: result.data.subject, model: result.model };
}

/** Review: the problem's sub-topic, type and core formula, in the student's AI output language. */
export async function runAnalyze(credential: AiCredential, language: Language, input: AnalyzeRequest, fetchImpl?: typeof fetch): Promise<AnalyzeResponse> {
  const { system, prompt } = buildAnalyzePrompt(input);
  const result = await runAiJson(
    credential,
    { task: "analysis", system, prompt, language, images: input.image ? [input.image] : undefined, maxOutputTokens: 700 },
    analyzeOutputSchema,
    fetchImpl,
    { languageText: (d) => `${d.type} ${d.core_concept}` },
  );
  return { type: tidy(result.data.type), core_concept: tidy(result.data.core_concept), model: result.model };
}
