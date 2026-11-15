/**
 * Prompt + response contracts for the two "AI skills" that are not tied to a stored card:
 *   - Document classifier (upload dialog): read the first page, return the official title and the subject.
 *   - Problem analyst (review): name the sub-topic / problem type and the core formula needed.
 * (The third skill, math reconstruction, is the OCR contract in `ocr-prompt.ts`.)
 * Pure and client-safe; the model calls live in `ai-jobs.ts` and the routes under /api/ai.
 */
import { z } from "zod";

const image = z.object({ mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]), data: z.string().max(8_000_000) });

// ── Feature A: document classifier ───────────────────────────────────────────────────────────────────────────────

export const CLASSIFY_SYSTEM_PROMPT = [
  "You are a document classifier. Analyze the provided exam/document first page. Extract the official Title and determine the Subject.",
  "Copy the title as printed (original language and wording); do not translate or invent one. If several subjects are plausible, choose the single best one.",
  'You MUST respond ONLY in valid JSON format: {"title": "extracted title", "subject": "subject name"}. No prose, no code fence.',
].join("\n");

export const classifyRequestSchema = z.object({
  image,
  /** Names of the subjects the student already has; the model should reuse one when it fits. */
  subjects: z.array(z.string().max(80)).max(40).default([]),
});
export type ClassifyRequest = z.infer<typeof classifyRequestSchema>;

export const classifyOutputSchema = z.object({ title: z.string().trim().min(1).max(200), subject: z.string().trim().min(1).max(100) });
export const classifyResponseSchema = classifyOutputSchema.extend({ model: z.string() });
export type ClassifyResponse = z.infer<typeof classifyResponseSchema>;

export function buildClassifyPrompt(input: ClassifyRequest): { system: string; prompt: string } {
  const known = input.subjects.length > 0 ? `\nThe student already has these subjects: ${input.subjects.map((s) => JSON.stringify(s)).join(", ")}. Use one of these exact names for "subject" when it fits; otherwise give the closest standard subject name.` : "";
  return { system: CLASSIFY_SYSTEM_PROMPT, prompt: `Classify the document in the attached image (its first page).${known}\nReturn the JSON object only.` };
}

// ── Feature C: problem type analysis ─────────────────────────────────────────────────────────────────────────────

export const ANALYZE_SYSTEM_PROMPT = [
  "You are an expert Math tutor. Analyze the provided math problem. Identify the specific sub-topic, problem type (Dạng toán), and the core theorem/formula required to solve it. Keep it extremely concise.",
  'Return JSON: {"type": "...", "core_concept": "..."}. `type` names the sub-topic and problem type in a few words; `core_concept` states the core theorem or formula (LaTeX allowed, enclosed in $...$). Do not solve the problem and do not reveal its answer. No code fence.',
].join("\n");

export const analyzeRequestSchema = z
  .object({
    subjectName: z.string().max(120).optional(),
    questionLatex: z.string().max(20_000).optional(),
    /** For image-only problems. */
    image: image.optional(),
  })
  .refine((v) => Boolean(v.questionLatex?.trim()) || Boolean(v.image), { message: "A question or an image is required" });
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;

export const analyzeOutputSchema = z.object({ type: z.string().trim().min(1).max(300), core_concept: z.string().trim().min(1).max(600) });
export const analyzeResponseSchema = analyzeOutputSchema.extend({ model: z.string() });
export type AnalyzeResponse = z.infer<typeof analyzeResponseSchema>;

export function buildAnalyzePrompt(input: AnalyzeRequest): { system: string; prompt: string } {
  const subject = input.subjectName ? `Subject: ${input.subjectName}\n` : "";
  const body = input.questionLatex?.trim() ? `Problem:\n${input.questionLatex.trim()}` : "The problem is in the attached image.";
  return { system: ANALYZE_SYSTEM_PROMPT, prompt: `${subject}${body}\n\nReturn the JSON object only.` };
}

// ── Matching an AI-suggested subject to the student's own ────────────────────────────────────────────────────────

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** The student's subject that the suggested name refers to (ignoring case and diacritics; one may contain the other). */
export function matchSubject<T extends { name: string }>(subjects: readonly T[], suggested: string): T | null {
  const wanted = fold(suggested);
  if (!wanted) return null;
  const exact = subjects.find((s) => fold(s.name) === wanted);
  if (exact) return exact;
  return subjects.find((s) => {
    const name = fold(s.name);
    return name.length >= 3 && (name.includes(wanted) || wanted.includes(name));
  }) ?? null;
}
