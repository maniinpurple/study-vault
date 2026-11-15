import "server-only";

import { z } from "zod";

import { AiProviderError, type AiCredential } from "@/lib/ai-provider";
import { LANGUAGES, type Language } from "@/lib/constants";
import { VaultError } from "@/lib/crypto";
import { getRepository } from "@/server/repository";
import { currentUserId } from "@/server/session";

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

/**
 * The provider credential for an AI call: the signed-in user's own active key, looked up by id. The browser names
 * a key; it never supplies (or receives) the ciphertext, and a key id that belongs to someone else resolves to NO_KEY.
 */
export async function resolveCredential(keyId: string): Promise<{ ok: true; credential: AiCredential } | { ok: false; response: Response }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, response: Response.json({ error: "UNAUTHENTICATED" }, { status: 401 }) };
  const credential = await getRepository().getApiKeyCredential(userId, keyId);
  if (!credential) return { ok: false, response: Response.json({ error: "NO_KEY" }, { status: 404 }) };
  return { ok: true, credential };
}

/** Map known failures to safe JSON; anything unexpected becomes a generic 500 (never echo internals). */
export function errorResponse(err: unknown): Response {
  if (err instanceof AiProviderError) {
    const status = err.code === "PROVIDER_HTTP" ? 502 : err.code === "NETWORK" || err.code === "TIMEOUT" ? 504 : err.code === "BAD_KEY" || err.code === "BAD_BASE_URL" || err.code === "NO_MODEL" ? 422 : 502;
    return Response.json({ error: err.code, message: err.message, providerStatus: err.status }, { status });
  }
  if (err instanceof VaultError) return Response.json({ error: "VAULT", message: "Vault error" }, { status: 500 });
  return Response.json({ error: "INTERNAL" }, { status: 500 });
}

/**
 * POST handler for a structured AI job: `{ keyId, language, input }` → the job's validated result.
 * The prompt is always built server-side from `input`; the browser only supplies data.
 */
export function aiJobHandler<S extends z.ZodType, R>(inputSchema: S, job: (credential: AiCredential, language: Language, input: z.infer<S>) => Promise<R>) {
  const bodySchema = z.object({ keyId: z.uuid(), language: z.enum(LANGUAGES), input: inputSchema });
  return async function POST(request: Request): Promise<Response> {
    const body = await parseJson(request, bodySchema);
    if (!body.ok) return body.response;
    const data = body.data as { keyId: string; language: Language; input: z.infer<S> };
    const key = await resolveCredential(data.keyId);
    if (!key.ok) return key.response;
    try {
      const result = await job(key.credential, data.language, data.input);
      return Response.json(result, { headers: { "cache-control": "no-store" } });
    } catch (err) {
      return errorResponse(err);
    }
  };
}
