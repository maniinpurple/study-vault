import { z } from "zod";

import { errorResponse, parseJson } from "@/lib/api-route";
import { AI_PROVIDERS } from "@/lib/constants";
import { encryptApiKey } from "@/lib/crypto";

const bodySchema = z.object({
  userId: z.string().min(1).max(64),
  provider: z.enum(AI_PROVIDERS),
  apiKey: z.string().trim().min(8).max(512),
});

/** Encrypts a plaintext provider key. The response contains the ciphertext envelope + last-4 hint only. */
export async function POST(request: Request) {
  const body = await parseJson(request, bodySchema);
  if (!body.ok) return body.response;
  try {
    const { encryptedKey, encryptionKeyId, keyHint } = encryptApiKey(body.data.apiKey, body.data.userId, body.data.provider);
    return Response.json({ encryptedKey, encryptionKeyId, keyHint }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}
