import "server-only";

import { z } from "zod";

import { buildPrompt, matchesLanguage, selectModel, TASK_TIER, type AiTask, type LanguageMode } from "@/lib/ai-prompt";
import { decryptApiKey } from "@/lib/crypto";
import { AI_PROVIDERS, type AiModelTier, type AiProvider, type Language } from "@/lib/constants";

/**
 * Unified BYOK adapter over Gemini, OpenAI, Anthropic and OpenAI-compatible endpoints.
 * The plaintext key lives only in a local variable for the duration of one request: it is never logged,
 * returned, or included in error messages.
 */

export const credentialSchema = z.object({
  userId: z.string().min(1).max(64),
  provider: z.enum(AI_PROVIDERS),
  encryptedKey: z.string().min(1).max(4096),
  baseUrl: z.string().max(512).nullish(),
  defaultModel: z.string().max(128).nullish(),
  visionModel: z.string().max(128).nullish(),
});
export type AiCredential = z.infer<typeof credentialSchema>;

export const imageSchema = z.object({
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  /** Base64 (no data: prefix). ~6 MB cap. */
  data: z.string().max(8_000_000),
});
export type AiImage = z.infer<typeof imageSchema>;

export interface AiRequest {
  task: AiTask;
  system?: string;
  prompt: string;
  language: Language;
  images?: AiImage[];
  /** Ask the provider for a JSON object response. */
  json?: boolean;
  /** Transcription task: the language directive covers only text the model authors, not text copied from the input. */
  verbatim?: boolean;
  /** See `LanguageMode`; ignored when `verbatim` is set. Defaults to "strict". */
  languageMode?: LanguageMode;
  maxOutputTokens?: number;
}

export interface AiResult {
  text: string;
  model: string;
  tier: AiModelTier;
}

export class AiProviderError extends Error {
  constructor(
    readonly code: "BAD_KEY" | "BAD_BASE_URL" | "NO_MODEL" | "PROVIDER_HTTP" | "NETWORK" | "EMPTY" | "INVALID_JSON" | "LANGUAGE_DRIFT" | "UNVERIFIED",
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

const TIMEOUT_MS = { LIGHT: 45_000, HEAVY: 120_000 } as const;

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:)/i;

/** Validate a user-supplied base URL. Private/loopback hosts are allowed only outside production (self-hosted models). */
export function assertSafeBaseUrl(raw: string, nodeEnv: string | undefined = process.env.NODE_ENV): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AiProviderError("BAD_BASE_URL", "Base URL is not a valid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new AiProviderError("BAD_BASE_URL", "Base URL must be http(s)");
  if (url.username || url.password) throw new AiProviderError("BAD_BASE_URL", "Base URL must not embed credentials");
  const isPrivate = PRIVATE_HOST.test(url.hostname);
  if (nodeEnv === "production" && (url.protocol !== "https:" || isPrivate)) {
    throw new AiProviderError("BAD_BASE_URL", "Base URL must be a public https URL");
  }
  return url;
}

interface ProviderCall {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  extract: (payload: unknown) => string | undefined;
}

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const rec = (v: unknown): Record<string, unknown> | undefined => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : undefined);
const first = (v: unknown): unknown => (Array.isArray(v) ? v[0] : undefined);

/** Build the provider-specific HTTP request. Pure → unit-testable without network. */
export function buildProviderCall(
  provider: AiProvider,
  apiKey: string,
  model: string,
  req: { system: string; prompt: string; images?: AiImage[]; json?: boolean; maxOutputTokens?: number },
  baseUrl?: string | null,
): ProviderCall {
  const maxTokens = req.maxOutputTokens ?? 4096;

  if (provider === "GEMINI") {
    const root = baseUrl ? assertSafeBaseUrl(baseUrl).toString().replace(/\/+$/, "") : "https://generativelanguage.googleapis.com/v1beta";
    return {
      url: `${root}/models/${encodeURIComponent(model)}:generateContent`,
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [...(req.images ?? []).map((i) => ({ inlineData: { mimeType: i.mimeType, data: i.data } })), { text: req.prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, ...(req.json ? { responseMimeType: "application/json" } : {}) },
      },
      extract: (p) => {
        const parts = rec(rec(first(rec(p)?.candidates))?.content)?.parts;
        return Array.isArray(parts) ? parts.map((x) => str(rec(x)?.text) ?? "").join("") : undefined;
      },
    };
  }

  if (provider === "ANTHROPIC") {
    const root = baseUrl ? assertSafeBaseUrl(baseUrl).toString().replace(/\/+$/, "") : "https://api.anthropic.com";
    return {
      url: `${root}/v1/messages`,
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: {
        model,
        max_tokens: maxTokens,
        system: req.system,
        messages: [
          {
            role: "user",
            content: [
              ...(req.images ?? []).map((i) => ({ type: "image", source: { type: "base64", media_type: i.mimeType, data: i.data } })),
              { type: "text", text: req.prompt },
            ],
          },
        ],
      },
      extract: (p) => {
        const content = rec(p)?.content;
        return Array.isArray(content) ? content.map((x) => str(rec(x)?.text) ?? "").join("") : undefined;
      },
    };
  }

  // OPENAI + CUSTOM (OpenAI-compatible chat completions)
  if (provider === "CUSTOM" && !baseUrl) throw new AiProviderError("BAD_BASE_URL", "Custom providers require a base URL");
  const root = baseUrl ? assertSafeBaseUrl(baseUrl).toString().replace(/\/+$/, "") : "https://api.openai.com/v1";
  return {
    url: `${root}/chat/completions`,
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: {
      model,
      max_tokens: maxTokens,
      ...(req.json ? { response_format: { type: "json_object" } } : {}),
      messages: [
        { role: "system", content: req.system },
        {
          role: "user",
          content: [
            ...(req.images ?? []).map((i) => ({ type: "image_url", image_url: { url: `data:${i.mimeType};base64,${i.data}` } })),
            { type: "text", text: req.prompt },
          ],
        },
      ],
    },
    extract: (p) => str(rec(rec(first(rec(p)?.choices))?.message)?.content),
  };
}

/** Run one task through the user's key. Light tasks use the cheap model, heavy tasks the user's chosen model. */
export async function runAiTask(credential: AiCredential, request: AiRequest, fetchImpl: typeof fetch = fetch): Promise<AiResult> {
  let apiKey: string;
  try {
    apiKey = decryptApiKey(credential.encryptedKey, credential.userId, credential.provider);
  } catch {
    // Deliberately vague: do not leak envelope/crypto details.
    throw new AiProviderError("BAD_KEY", "Stored API key could not be decrypted");
  }

  let model: string;
  try {
    model = selectModel(request.task, {
      provider: credential.provider,
      defaultModel: credential.defaultModel ?? null,
      visionModel: credential.visionModel ?? null,
    });
  } catch {
    throw new AiProviderError("NO_MODEL", "No model configured for this API key");
  }

  const tier = TASK_TIER[request.task];
  const { system, prompt } = buildPrompt({ system: request.system, prompt: request.prompt, language: request.language, verbatim: request.verbatim, languageMode: request.languageMode });
  const call = buildProviderCall(credential.provider, apiKey, model, { ...request, system, prompt }, credential.baseUrl);

  let response: Response;
  try {
    response = await fetchImpl(call.url, {
      method: "POST",
      headers: call.headers,
      body: JSON.stringify(call.body),
      signal: AbortSignal.timeout(TIMEOUT_MS[tier]),
      redirect: "error",
    });
  } catch {
    throw new AiProviderError("NETWORK", "Could not reach the AI provider");
  }

  if (!response.ok) {
    // Provider error bodies can echo request details; surface only the status and the provider's short message.
    let detail = "";
    try {
      const body = rec(await response.json());
      detail = str(rec(body?.error)?.message) ?? str(body?.message) ?? "";
    } catch {
      /* non-JSON error body */
    }
    const safe = detail.replaceAll(apiKey, "[redacted]").slice(0, 200);
    throw new AiProviderError("PROVIDER_HTTP", safe || `Provider returned HTTP ${response.status}`, response.status);
  }

  const text = call.extract(await response.json().catch(() => undefined))?.trim();
  if (!text) throw new AiProviderError("EMPTY", "The AI provider returned an empty response");
  return { text, model, tier };
}

export function stripFence(text: string): string {
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text.trim());
  return match ? match[1] : text.trim();
}

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => collectStrings(v, out));
  else if (typeof value === "object" && value !== null) Object.values(value).forEach((v) => collectStrings(v, out));
  return out;
}

export interface AiJsonOptions<T> {
  /** Which text must be in the output language (default: every string in the reply). */
  languageText?: (data: T) => string;
  /** Extra semantic check; return a problem description to reject the reply (it is retried once with the problem). */
  validate?: (data: T) => string | null;
  /** Total attempts (default 2). */
  attempts?: number;
}

/**
 * Request JSON, parse it with `schema`, and verify the prose language. Retries once (with the failure
 * described) before giving up — model output is never trusted.
 */
export async function runAiJson<T>(
  credential: AiCredential,
  request: Omit<AiRequest, "json">,
  schema: z.ZodType<T>,
  fetchImpl: typeof fetch = fetch,
  options: AiJsonOptions<T> = {},
): Promise<AiResult & { data: T }> {
  let problem = "";
  let failure: AiProviderError["code"] = "INVALID_JSON";
  const attempts = Math.max(1, options.attempts ?? 2);
  for (let attempt = 0; attempt < attempts; attempt++) {
    const prompt = attempt === 0 ? request.prompt : `${request.prompt}\n\nYour previous reply was rejected: ${problem}. Return corrected JSON only.`;
    const result = await runAiTask(credential, { ...request, prompt, json: true }, fetchImpl);
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripFence(result.text));
    } catch {
      problem = "it was not valid JSON";
      failure = "INVALID_JSON";
      continue;
    }
    const checked = schema.safeParse(parsed);
    if (!checked.success) {
      problem = `it did not match the required schema (${z.prettifyError(checked.error).slice(0, 300)})`;
      failure = "INVALID_JSON";
      continue;
    }
    const prose = options.languageText ? options.languageText(checked.data) : collectStrings(checked.data).join(" ");
    if (!matchesLanguage(prose, request.language)) {
      problem = `its natural-language text was not in the required output language`;
      failure = "LANGUAGE_DRIFT";
      continue;
    }
    const semantic = options.validate?.(checked.data) ?? null;
    if (semantic) {
      problem = semantic;
      failure = "UNVERIFIED";
      continue;
    }
    return { ...result, data: checked.data };
  }
  throw new AiProviderError(failure, `AI output rejected: ${problem}`);
}

