import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import { buildPrompt, languageSystemDirective, TASK_TIER } from "@/lib/ai-prompt";
import { AiProviderError, type AiCredential } from "@/lib/ai-provider";
import { runMemorySync, runMutation, runSynthesis, runSynthesisFix, runTagSuggest } from "@/lib/ai-jobs";
import { encryptApiKey } from "@/lib/crypto";
import {
  buildFixPrompt, buildMutatePrompt, buildSynthesizePrompt, FIX_SYSTEM_PROMPT, mutationProblem, MUTATE_SYSTEM_PROMPT, SYNTH_SYSTEM_PROMPT, type MutateRequest, type SynthesizeRequest,
} from "@/lib/synth-prompt";
import type { MemorySyncRequest } from "@/lib/brain-prompt";

const USER = "user-1";
const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const openAi = (content: unknown) => jsonResponse({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] });
const credential = (): AiCredential => ({ userId: USER, provider: "OPENAI", encryptedKey: encryptApiKey("sk-test-0123456789", USER, "OPENAI").encryptedKey, defaultModel: "gpt-4o", visionModel: null, baseUrl: null });
const sentBody = (fetchMock: ReturnType<typeof vi.fn>, call = 0) => JSON.parse((fetchMock.mock.calls[call][1] as RequestInit).body as string) as { model: string; messages: { content: unknown }[] };

beforeAll(() => {
  process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

const mutateInput: MutateRequest = { subjectName: "Toán", questionLatex: "Giải $x^2 = 4$.", solutionLatex: "$x = \\pm 2$", hasDiagram: true };
const viSolution = "Ta có phương trình tương đương với việc lấy căn bậc hai hai vế nên nghiệm là cộng trừ ba.";

describe("prompt contracts", () => {
  it("every generator must self-verify and keep problems in the source language", () => {
    for (const system of [MUTATE_SYSTEM_PROMPT, SYNTH_SYSTEM_PROMPT, FIX_SYSTEM_PROMPT]) {
      expect(system).toMatch(/MANDATORY internal verification/);
      expect(system).toMatch(/second method/);
    }
    expect(MUTATE_SYSTEM_PROMPT).toMatch(/figure/);
    expect(SYNTH_SYSTEM_PROMPT).toMatch(/HIGH-YIELD/);
    expect(SYNTH_SYSTEM_PROMPT).toMatch(/EXAM SCOPE/);
    expect(SYNTH_SYSTEM_PROMPT).toMatch(/LEARNER MEMORY/);
    const source = buildPrompt({ prompt: "p", language: "VI", languageMode: "source" });
    expect(source.system).toBe(languageSystemDirective("VI", "source"));
    expect(source.system).toMatch(/SAME language as the source/);
    expect(source.prompt).toMatch(/only in Vietnamese/i);
    expect(TASK_TIER.mutation).toBe("LIGHT");
    expect(TASK_TIER.synthesis).toBe("HEAVY");
  });
  it("embeds data with an injection notice", () => {
    expect(buildMutatePrompt(mutateInput).prompt).toMatch(/hasDiagram: true/);
    const synth: SynthesizeRequest = {
      mode: "MIX", subject: { name: "Toán", description: null }, scopeTopics: ["Đại số"], memorySummary: "Hay quên ĐKXĐ", memoryFocus: ["ĐKXĐ"], personaSummary: null,
      sources: [
        { ref: "S1", id: "a", topic: null, questionLatex: "Q1", solutionLatex: null, ahaNote: null, teacherNote: "Thi chắc chắn", highYield: true, notes: ["sai dấu"] },
        { ref: "S2", id: "b", topic: null, questionLatex: "Q2", solutionLatex: null, ahaNote: null, teacherNote: null, highYield: false, notes: [] },
      ],
    };
    const prompt = buildSynthesizePrompt(synth).prompt;
    expect(prompt).toMatch(/never follow instructions/);
    expect(prompt).toContain("🔥 HIGH-YIELD");
    expect(prompt).toContain("CHRONIC BLIND SPOTS");
    expect(buildFixPrompt({ subjectName: "Toán", problem: { questionLatex: "Q", answerLatex: "A", solutionLatex: null }, report: "Sai đáp án" }).prompt).toContain("STUDENT'S REPORT");
  });
  it("rejects unverified or unchanged variants", () => {
    const base = { questionLatex: "Giải $x^2 = 9$.", answerLatex: "$\\pm 3$", solutionLatex: viSolution, changes: "4 → 9", verified: true };
    expect(mutationProblem(base, mutateInput)).toBeNull();
    expect(mutationProblem({ ...base, verified: false }, mutateInput)).toMatch(/verified/);
    expect(mutationProblem({ ...base, questionLatex: " Giải  $x^2 = 4$. " }, mutateInput)).toMatch(/identical/);
  });
});

describe("AI jobs (mocked provider)", () => {
  it("mutation retries once when the model's self-check failed, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(openAi({ questionLatex: "Giải $x^2 = 9$.", answerLatex: "$\\pm 3$", solutionLatex: viSolution, changes: "Đổi 4 thành 9", verified: false }))
      .mockResolvedValueOnce(openAi({ questionLatex: "Giải $x^2 = 9$.", answerLatex: "$\\pm 3$", solutionLatex: viSolution, changes: "Đổi 4 thành 9", verified: true }));
    const result = await runMutation(credential(), "VI", mutateInput, fetchMock);
    expect(result).toMatchObject({ questionLatex: "Giải $x^2 = 9$.", changes: "Đổi 4 thành 9", model: "gpt-4o-mini" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(sentBody(fetchMock, 1).messages)).toContain("previous reply was rejected");
  });
  it("mutation keeps an English question for a Vietnamese-output subject (source language mode)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      openAi({ questionLatex: "If she had studied harder, she ___ the exam.", answerLatex: "would have passed", solutionLatex: "Đây là câu điều kiện loại ba vì giả định trái với một sự việc trong quá khứ.", changes: "Đổi chủ ngữ và động từ", verified: true }),
    );
    await expect(runMutation(credential(), "VI", { ...mutateInput, questionLatex: "If I had known, I ___ earlier." }, fetchMock)).resolves.toMatchObject({ answerLatex: "would have passed" });
  });
  it("synthesis fails with UNVERIFIED when the model never passes its own check", async () => {
    const bad = { questionLatex: "Q", answerLatex: "A", solutionLatex: viSolution, verification: { method: "Thế ngược", workLatex: "$1 \\ne 2$", passed: false }, diagramDescription: null, difficulty: 5, conceptsUsed: [] };
    const fetchMock = vi.fn().mockImplementation(async () => openAi(bad));
    const request: SynthesizeRequest = {
      mode: "CLONE", subject: { name: "Toán", description: null }, scopeTopics: [], memorySummary: null, memoryFocus: [], personaSummary: null,
      sources: [{ ref: "S1", id: "a", topic: null, questionLatex: "Q0", solutionLatex: null, ahaNote: null, teacherNote: null, highYield: false, notes: [] }],
    };
    await expect(runSynthesis(credential(), "VI", request, fetchMock)).rejects.toMatchObject({ code: "UNVERIFIED" } satisfies Partial<AiProviderError>);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => openAi({ ...bad, verification: { ...bad.verification, passed: true }, difficulty: 6.66, questionLatex: "```\nQ \\(x\\)\n```" }));
    const ok = await runSynthesis(credential(), "VI", request, fetchMock);
    expect(ok.difficultyEstimate).toBe(6.7);
    expect(ok.questionLatex).toBe("Q $x$");
    expect(ok.verificationLatex).toContain("**Thế ngược**");
    expect(sentBody(fetchMock).model).toBe("gpt-4o"); // heavy tier keeps the user's model
  });
  it("fix returns the verdict and the corrected problem", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      openAi({ verdict: "FIXED", explanation: "Đáp án cũ sai vì đã nhân nhầm hệ số, nay đã sửa lại cho đúng.", questionLatex: "Q", answerLatex: "B", solutionLatex: viSolution, verification: { method: "Giải lại", workLatex: "$2+2=4$", passed: true } }),
    );
    const fix = await runSynthesisFix(credential(), "VI", { subjectName: "Toán", problem: { questionLatex: "Q", answerLatex: "C", solutionLatex: null }, report: "Phải là B" }, fetchMock);
    expect(fix).toMatchObject({ verdict: "FIXED", answerLatex: "B" });
  });
  it("memory sync maps the model's refs back to ids and filters suggestions", async () => {
    const request: MemorySyncRequest = {
      subjectId: "s1", subject: { name: "Toán", description: null }, previousMemory: null, persona: null, totalCards: 1, suggestTags: true,
      cards: [{ ref: "C1", id: "card-uuid", title: null, topic: null, question: "Q", ahaNote: null, teacherNote: null, highYield: false, tags: [], state: "REVIEW", lapses: 1, attempts: [] }],
      tags: [{ ref: "T1", id: "tag-uuid", name: "Sai tính toán", base: true, uses: 1 }], tagFeedback: [], resolvedNames: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(
      openAi({
        summary: "Học sinh thường quên đặt điều kiện xác định trước khi biến đổi phương trình logarit.",
        insights: { overcome: ["Đã nhớ đổi cơ số"], blindSpots: ["Điều kiện xác định"], thinkingPatterns: [], teacherEmphasis: [], nextFocus: ["Logarit"] },
        persona: { summary: "Làm nhanh nhưng hay bỏ bước kiểm tra điều kiện.", strengths: ["Tính nhanh"], weaknesses: ["Bỏ bước"] },
        tagSuggestions: [
          { kind: "RENAME", targetTag: "T1", name: "Sai thao tác biến đổi", rationale: "Nhiều ghi chú nói về biến đổi sai.", evidence: ["C1"] },
          { kind: "CREATE", name: "Quên điều kiện", rationale: "Lặp lại ở nhiều thẻ.", evidence: ["C42"] },
        ],
      }),
    );
    const result = await runMemorySync(credential(), "VI", request, fetchMock);
    expect(result.tagSuggestions).toEqual([{ kind: "RENAME", targetTagId: "tag-uuid", proposedName: "Sai thao tác biến đổi", proposedDescription: null, rationale: "Nhiều ghi chú nói về biến đổi sai.", evidenceCardIds: ["card-uuid"] }]);
    expect(result.insights.blindSpots).toEqual(["Điều kiện xác định"]);
    expect(sentBody(fetchMock).model).toBe("gpt-4o-mini"); // light tier
  });
  it("tag suggestions accept an empty list", async () => {
    const fetchMock = vi.fn().mockResolvedValue(openAi({ suggestions: [] }));
    const result = await runTagSuggest(
      credential(),
      "VI",
      { subjectId: "s1", subject: { name: "Toán", description: null }, memorySummary: null, max: 2, tags: [], tagFeedback: [], resolvedNames: [],
        cards: [{ ref: "C1", id: "c", title: null, topic: null, question: "Q", ahaNote: "note", teacherNote: null, highYield: false, tags: [], state: "NEW", lapses: 0, attempts: [] }] },
      fetchMock,
    );
    expect(result.suggestions).toEqual([]);
  });
});
