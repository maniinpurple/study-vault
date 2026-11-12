import "server-only";

import { z } from "zod";

import { AiProviderError, credentialSchema, type AiCredential } from "@/lib/ai-provider";
import { LANGUAGES, type Language } from "@/lib/constants";
import { VaultError } from "@/lib/crypto";

/** Parse a JSON body with zod; returns a ready-to-send 400 Response on failure. */
export async function parseJson<S extends z.ZodType>(request: Request, schema: S): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: Response.json({ error: "INVALID_JSON" }, { status: 400 }) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: Response.json({ error: "INVALID_REQUEST", detail: z.prettifyError(parsed.error) }, { status: 400 }) };
  return { ok: true, data: parsed.data };
}

/** Map known failures to safe JSON; anything unexpected becomes a generic 500 (never echo internals). */
export function errorResponse(err: unknown): Response {
  if (err instanceof AiProviderError) {
    const status = err.code === "PROVIDER_HTTP" ? 502 : err.code === "NETWORK" ? 504 : err.code === "BAD_KEY" || err.code === "BAD_BASE_URL" || err.code === "NO_MODEL" ? 422 : 502;
    return Response.json({ error: err.code, message: err.message, providerStatus: err.status }, { status });
  }
  if (err instanceof VaultError) return Response.json({ error: "VAULT", message: "Vault error" }, { status: 500 });
  return Response.json({ error: "INTERNAL" }, { status: 500 });
}

/**
 * POST handler for a structured AI job: `{ credential, language, input }` → the job's validated result.
 * The prompt is always built server-side from `input`; the browser only supplies data.
 */
export function aiJobHandler<S extends z.ZodType, R>(inputSchema: S, job: (credential: AiCredential, language: Language, input: z.infer<S>) => Promise<R>) {
  const bodySchema = z.object({ credential: credentialSchema, language: z.enum(LANGUAGES), input: inputSchema });
  return async function POST(request: Request): Promise<Response> {
    const body = await parseJson(request, bodySchema);
    if (!body.ok) return body.response;
    try {
      const data = body.data as { credential: AiCredential; language: Language; input: z.infer<S> };
      const result = await job(data.credential, data.language, data.input);
      return Response.json(result, { headers: { "cache-control": "no-store" } });
    } catch (err) {
      return errorResponse(err);
    }
  };
}
