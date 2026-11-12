/**
 * Browser → Phase 4 AI routes. Only the stored ciphertext is sent (the server decrypts in memory); responses are
 * zod-validated before the UI touches them.
 */
import { z } from "zod";

import { memorySyncResponseSchema, tagSuggestResponseSchema, type MemorySyncRequest, type MemorySyncResponse, type TagSuggestRequest, type TagSuggestResponse } from "@/lib/brain-prompt";
import type { Language } from "@/lib/constants";
import type { UserApiKey } from "@/lib/repo/types";
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
  userId: string;
  key: UserApiKey;
  language: Language;
  signal?: AbortSignal;
}

function credentialOf(userId: string, key: UserApiKey) {
  return { userId, provider: key.provider, encryptedKey: key.encryptedKey, baseUrl: key.baseUrl, defaultModel: key.defaultModel, visionModel: key.visionModel };
}

async function postJob<T>(path: string, call: AiCall, input: unknown, schema: z.ZodType<T>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: call.signal,
      body: JSON.stringify({ credential: credentialOf(call.userId, call.key), language: call.language, input }),
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
