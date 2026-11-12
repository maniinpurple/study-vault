/** Browser → `/api/ai/ocr`. The key never leaves as plaintext: the server decrypts the stored ciphertext in memory. */
import { z } from "zod";

import type { Language } from "@/lib/constants";
import type { UserApiKey } from "@/lib/repo/types";

export class OcrRequestError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "OcrRequestError";
  }
}

const responseSchema = z.object({
  markdown: z.string(),
  containsFigure: z.boolean(),
  confidence: z.number().nullable(),
  model: z.string(),
});
export type OcrResponse = z.infer<typeof responseSchema>;

export async function requestOcr(input: { userId: string; key: UserApiKey; language: Language; imageBase64: string; signal?: AbortSignal }): Promise<OcrResponse> {
  let res: Response;
  try {
    res = await fetch("/api/ai/ocr", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: input.signal,
      body: JSON.stringify({
        credential: {
          userId: input.userId,
          provider: input.key.provider,
          encryptedKey: input.key.encryptedKey,
          baseUrl: input.key.baseUrl,
          defaultModel: input.key.defaultModel,
          visionModel: input.key.visionModel,
        },
        image: { mimeType: "image/jpeg", data: input.imageBase64 },
        language: input.language,
      }),
    });
  } catch {
    throw new OcrRequestError("NETWORK");
  }
  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    const code = z.object({ error: z.string() }).safeParse(body);
    throw new OcrRequestError(code.success ? code.data.error : "UNKNOWN");
  }
  const parsed = responseSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new OcrRequestError("INVALID_JSON");
  return parsed.data;
}
