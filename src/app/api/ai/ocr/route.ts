import { z } from "zod";

import { credentialSchema, imageSchema } from "@/lib/ai-provider";
import { errorResponse, parseJson } from "@/lib/api-route";
import { LANGUAGES } from "@/lib/constants";
import { runOcr } from "@/lib/ocr";

const bodySchema = z.object({
  credential: credentialSchema,
  image: imageSchema,
  language: z.enum(LANGUAGES),
});

/**
 * Exam-scanner OCR: one cropped question image → clean Markdown + KaTeX via the user's vision model.
 * The prompt is built server-side (the browser cannot inject its own), and the reply is zod-validated.
 */
export async function POST(request: Request) {
  const body = await parseJson(request, bodySchema);
  if (!body.ok) return body.response;
  try {
    const result = await runOcr(body.data.credential, body.data.image, body.data.language);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
