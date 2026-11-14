import { z } from "zod";

import { imageSchema } from "@/lib/ai-provider";
import { errorResponse, parseJson, resolveCredential } from "@/lib/api-route";
import { LANGUAGES } from "@/lib/constants";
import { runOcr } from "@/lib/ocr";

const bodySchema = z.object({
  keyId: z.uuid(),
  image: imageSchema,
  language: z.enum(LANGUAGES),
});

/**
 * "Convert to text": one cropped question image → clean Markdown + KaTeX via the signed-in user's vision model.
 * The prompt is built server-side (the browser cannot inject its own), and the reply is zod-validated.
 */
export async function POST(request: Request) {
  const body = await parseJson(request, bodySchema);
  if (!body.ok) return body.response;
  const key = await resolveCredential(body.data.keyId);
  if (!key.ok) return key.response;
  try {
    const result = await runOcr(key.credential, body.data.image, body.data.language);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
