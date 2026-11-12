import { z } from "zod";

import { credentialSchema, runAiTask } from "@/lib/ai-provider";
import { errorResponse, parseJson } from "@/lib/api-route";

const bodySchema = z.object({ credential: credentialSchema });

/** Cheap connectivity check (one tiny light-tier completion) for a stored key. */
export async function POST(request: Request) {
  const body = await parseJson(request, bodySchema);
  if (!body.ok) return body.response;
  try {
    const result = await runAiTask(body.data.credential, {
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
