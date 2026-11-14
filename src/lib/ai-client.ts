/**
 * Browser → AI routes. The request names one of the user's keys by id; the server loads and decrypts it for the
 * signed-in user. Responses are zod-validated before the UI touches them.
 */
import { z } from "zod";

import { memorySyncResponseSchema, tagSuggestResponseSchema, type MemorySyncRequest, type MemorySyncResponse, type TagSuggestRequest, type TagSuggestResponse } from "@/lib/brain-prompt";
import type { Language } from "@/lib/constants";
import {
  fixResponseSchema, mutateResponseSchema, synthesizeResponseSchema, type FixRequest, type FixResponse, type MutateRequest, type MutateResponse, type SynthesizeRequest,
  type SynthesizeResponse,
} from "@/lib/synth-prompt";

export class AiRequestError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AiRequestError";
  }
}

export interface AiCall {
  /** Id of the API key to use (one of the signed-in user's own). */
  keyId: string;
  language: Language;
  signal?: AbortSignal;
}

async function postJob<T>(path: string, call: AiCall, input: unknown, schema: z.ZodType<T>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: call.signal,
      body: JSON.stringify({ keyId: call.keyId, language: call.language, input }),
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw new AiRequestError("ABORTED");
    throw new AiRequestError("NETWORK");
  }
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const code = z.object({ error: z.string() }).safeParse(body);
    throw new AiRequestError(code.success ? code.data.error : "UNKNOWN");
  }
  const parsed = schema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new AiRequestError("INVALID_JSON");
  return parsed.data;
}

export const requestMutation = (call: AiCall, input: MutateRequest): Promise<MutateResponse> => postJob("/api/ai/mutate", call, input, mutateResponseSchema);
export const requestMemorySync = (call: AiCall, input: MemorySyncRequest): Promise<MemorySyncResponse> => postJob("/api/ai/memory-sync", call, input, memorySyncResponseSchema);
export const requestTagSuggestions = (call: AiCall, input: TagSuggestRequest): Promise<TagSuggestResponse> => postJob("/api/ai/tag-suggest", call, input, tagSuggestResponseSchema);
export const requestSynthesis = (call: AiCall, input: SynthesizeRequest): Promise<SynthesizeResponse> => postJob("/api/ai/synthesize", call, input, synthesizeResponseSchema);
export const requestSynthesisFix = (call: AiCall, input: FixRequest): Promise<FixResponse> => postJob("/api/ai/synthesize/fix", call, input, fixResponseSchema);
