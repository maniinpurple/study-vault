import "server-only";

import { z } from "zod";

import { AiProviderError, runAiTask, stripFence, type AiCredential, type AiImage } from "@/lib/ai-provider";
import type { Language } from "@/lib/constants";
import { normalizeOcrMarkdown, OCR_MAX_ATTEMPTS, OCR_SYSTEM_PROMPT, OCR_USER_PROMPT, ocrResultSchema } from "@/lib/ocr-prompt";

export interface OcrOutput {
  markdown: string;
  containsFigure: boolean;
  confidence: number | null;
  model: string;
}

/**
 * Send one question crop to the user's vision model and return clean Markdown+LaTeX. The reply is requested as JSON
 * and validated with zod; on a malformed reply the call is retried once with the problem described.
 * The transcription keeps the document's language (verbatim mode); the model authors no other prose.
 */
export async function runOcr(credential: AiCredential, image: AiImage, language: Language, fetchImpl: typeof fetch = fetch): Promise<OcrOutput> {
  let problem = "";
  for (let attempt = 0; attempt < OCR_MAX_ATTEMPTS; attempt++) {
    const prompt = attempt === 0 ? OCR_USER_PROMPT : `${OCR_USER_PROMPT}\n\nYour previous reply was rejected: ${problem}. Return corrected JSON only.`;
    const result = await runAiTask(
      credential,
      { task: "ocr", system: OCR_SYSTEM_PROMPT, prompt, language, images: [image], json: true, verbatim: true, maxOutputTokens: 4096 },
      fetchImpl,
    );

    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFence(result.text));
    } catch {
      problem = "it was not valid JSON";
      continue;
    }
    const checked = ocrResultSchema.safeParse(parsed);
    if (!checked.success) {
      problem = `it did not match the required schema (${z.prettifyError(checked.error).slice(0, 300)})`;
      continue;
    }
    const markdown = normalizeOcrMarkdown(checked.data.markdown);
    if (!markdown) {
      problem = "the `markdown` field was empty";
      continue;
    }
    return { markdown, containsFigure: checked.data.containsFigure, confidence: checked.data.confidence ?? null, model: result.model };
  }
  throw new AiProviderError("INVALID_JSON", `OCR output rejected: ${problem}`);
}
