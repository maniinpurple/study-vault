/**
 * Prompt + response contract for the exam-scanner "clean rewrite". Pure and client-safe (the network call is in
 * `ocr.ts`, server-only). The model is asked to TRANSCRIBE the printed question — never to solve or translate it —
 * and to ignore the student's handwriting, circles, ticks and strike-throughs.
 */
import { z } from "zod";

export const OCR_MAX_ATTEMPTS = 2;

export const OCR_SYSTEM_PROMPT = [
  "You are a precise exam-paper transcription engine. The image is a crop of ONE question from a student's exam: a PDF export or a phone photo of a printed test (it may be skewed, shadowed or low-contrast).",
  "",
  "Reconstruct the ENTIRE PRINTED question perfectly as clean Markdown with LaTeX:",
  "- Keep the original wording and language exactly. Never translate, paraphrase, summarise, correct or solve anything.",
  "- Write every formula as LaTeX: inline as $...$ and display equations as $$...$$. Do not use \\( \\) or \\[ \\] delimiters. Never wrap the answer in a code fence.",
  "- Multiple choice: put each option on its own line as `A. ...`, `B. ...` (keep the paper's own labels).",
  "- Keep numbering, sub-questions (a, b, c) and units. Use blank lines between paragraphs.",
  "",
  "IGNORE completely — as if it were not on the page: blurry artifacts, scan noise, handwriting, pen or pencil scratch work, margin notes, underlines, highlighting, circles, ticks, crosses and strike-throughs (including a circled multiple-choice letter). Do not mention them. Never indicate which option the student chose or which answer is correct.",
  "",
  "Figures: do not describe, redraw or caption any diagram, graph, geometry figure or circuit; simply leave it out of the text and set `containsFigure` to true.",
  "If a printed part is illegible, write `[?]` in its place instead of guessing.",
  "",
  'Reply with ONE JSON object and nothing else: {"markdown": string, "containsFigure": boolean, "confidence": number}. `confidence` is your 0–1 estimate that the transcription is complete and exact.',
].join("\n");

export const OCR_USER_PROMPT = "Transcribe the printed question in the attached image. Return the JSON object only.";

export const ocrResultSchema = z.object({
  markdown: z.string().max(20_000),
  containsFigure: z.boolean().default(false),
  confidence: z.number().min(0).max(1).optional(),
});
export type OcrResult = z.infer<typeof ocrResultSchema>;

/** Tidy model output: strip a wrapping code fence, convert \( \) / \[ \] to $ / $$, normalise newlines and blank lines. */
export function normalizeOcrMarkdown(input: string): string {
  let text = input.replace(/\r\n?/g, "\n").trim();
  const fenced = /^```(?:markdown|md|latex|tex)?\n([\s\S]*?)\n```$/i.exec(text);
  if (fenced) text = fenced[1];
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_m, body: string) => `$$${body.trim()}$$`).replace(/\\\(([\s\S]+?)\\\)/g, (_m, body: string) => `$${body.trim()}$`);
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
