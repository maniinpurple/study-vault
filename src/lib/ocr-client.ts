/** Browser → `/api/ai/ocr`. The request names a key by id; the server decrypts it in memory for the signed-in user. */
import { z } from "zod";

import type { Language } from "@/lib/constants";

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

export async function requestOcr(input: { keyId: string; language: Language; imageBase64: string; signal?: AbortSignal }): Promise<OcrResponse> {
  let res: Response;
  try {
    res = await fetch("/api/ai/ocr", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: input.signal,
      body: JSON.stringify({
        keyId: input.keyId,
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
