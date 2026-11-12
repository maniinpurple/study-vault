import { z } from "zod";

import { AI_TASKS } from "@/lib/ai-prompt";
import { credentialSchema, imageSchema, runAiTask } from "@/lib/ai-provider";
import { errorResponse, parseJson } from "@/lib/api-route";
import { LANGUAGES } from "@/lib/constants";

const bodySchema = z.object({
  credential: credentialSchema,
  task: z.enum(AI_TASKS).exclude(["connection_test"]),
  system: z.string().max(20_000).optional(),
  prompt: z.string().min(1).max(60_000),
  language: z.enum(LANGUAGES),
  images: z.array(imageSchema).max(4).optional(),
  json: z.boolean().optional(),
  maxOutputTokens: z.number().int().min(16).max(16_000).optional(),
});

/** Proxies one AI task through the user's decrypted key. Output must be validated by the caller (zod). */
export async function POST(request: Request) {
  const body = await parseJson(request, bodySchema);
  if (!body.ok) return body.response;
  const { credential, ...req } = body.data;
  try {
    const result = await runAiTask(credential, req);
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
