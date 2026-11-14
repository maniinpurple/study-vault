import { z } from "zod";

import { runAiTask } from "@/lib/ai-provider";
import { errorResponse, parseJson, resolveCredential } from "@/lib/api-route";

const bodySchema = z.object({ keyId: z.uuid() });

/** Cheap connectivity check (one tiny light-tier completion) for one of the signed-in user's stored keys. */
export async function POST(request: Request) {
  const body = await parseJson(request, bodySchema);
  if (!body.ok) return body.response;
  const key = await resolveCredential(body.data.keyId);
  if (!key.ok) return key.response;
  try {
    const result = await runAiTask(key.credential, {
      task: "connection_test",
      prompt: "Reply with the single word: ok",
      language: "EN",
      maxOutputTokens: 16,
    });
    return Response.json({ ok: true, model: result.model }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
