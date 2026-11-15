import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AiProviderError, assertSafeBaseUrl, buildProviderCall, CONNECTION_TEST_TIMEOUT_MS, runAiJson, runAiTask, timeoutFor, type AiCredential } from "@/lib/ai-provider";
import { encryptApiKey } from "@/lib/crypto";

const USER = "user-1";
const SECRET = "sk-super-secret-0123456789";

function credential(provider: AiCredential["provider"], extra: Partial<AiCredential> = {}): AiCredential {
  return { userId: USER, provider, encryptedKey: encryptApiKey(SECRET, USER, provider).encryptedKey, defaultModel: null, visionModel: null, baseUrl: null, ...extra };
}
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A fetch that never answers on its own and rejects like the real one when its request is aborted. */
function hangingFetch() {
  return vi.fn((_url: unknown, init?: RequestInit) => new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as unknown as typeof fetch;
}

beforeAll(() => {
  process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("buildProviderCall", () => {
  const req = { system: "SYS", prompt: "PROMPT", json: true, images: [{ mimeType: "image/png", data: "AAAA" }] } as const;
  it("builds a Gemini request with the key in a header, never the URL", () => {
    const call = buildProviderCall("GEMINI", SECRET, "gemini-3.8-flash", { ...req, images: [...req.images] });
    expect(call.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
    // The URL carries `models/` exactly once, whichever form the stored id has, and retired ids are replaced.
    for (const stored of ["models/gemini-3.8-flash", "gemini-2.5-flash"]) {
      expect(buildProviderCall("GEMINI", SECRET, stored, { ...req, images: [...req.images] }).url).toBe(call.url);
    }
    expect(call.url).not.toContain(SECRET);
    expect(call.headers["x-goog-api-key"]).toBe(SECRET);
    expect(JSON.stringify(call.body)).toContain("responseMimeType");
    expect(call.extract({ candidates: [{ content: { parts: [{ text: "hi" }] } }] })).toBe("hi");
  });
  it("builds an OpenAI request with a vision data-URL", () => {
    const call = buildProviderCall("OPENAI", SECRET, "gpt-4o-mini", { ...req, images: [...req.images] });
    expect(call.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(call.headers.authorization).toBe(`Bearer ${SECRET}`);
    expect(JSON.stringify(call.body)).toContain("data:image/png;base64,AAAA");
    expect(call.extract({ choices: [{ message: { content: "yo" } }] })).toBe("yo");
  });
  it("builds an Anthropic request", () => {
    const call = buildProviderCall("ANTHROPIC", SECRET, "claude-haiku-5-5", { system: "S", prompt: "P" });
    expect(call.url).toBe("https://api.anthropic.com/v1/messages");
    expect(call.headers["x-api-key"]).toBe(SECRET);
    expect(call.headers["anthropic-version"]).toBeTruthy();
    expect(call.extract({ content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] })).toBe("ab");
  });
  it("requires a base URL for CUSTOM providers", () => {
    expect(() => buildProviderCall("CUSTOM", SECRET, "m", { system: "s", prompt: "p" })).toThrow(AiProviderError);
    expect(buildProviderCall("CUSTOM", SECRET, "m", { system: "s", prompt: "p" }, "https://llm.example.com/v1/").url).toBe("https://llm.example.com/v1/chat/completions");
  });
});

describe("assertSafeBaseUrl", () => {
  it("rejects non-http(s) schemes and embedded credentials", () => {
    expect(() => assertSafeBaseUrl("file:///etc/passwd", "development")).toThrow();
    expect(() => assertSafeBaseUrl("https://user:pw@example.com", "development")).toThrow();
    expect(() => assertSafeBaseUrl("nope", "development")).toThrow();
  });
  it("allows loopback in development but not in production", () => {
    expect(() => assertSafeBaseUrl("http://localhost:11434/v1", "development")).not.toThrow();
    expect(() => assertSafeBaseUrl("http://localhost:11434/v1", "production")).toThrow();
    expect(() => assertSafeBaseUrl("https://10.0.0.5/v1", "production")).toThrow();
    expect(() => assertSafeBaseUrl("https://169.254.169.254/", "production")).toThrow();
    expect(() => assertSafeBaseUrl("https://api.example.com/v1", "production")).not.toThrow();
  });
});

describe("runAiTask", () => {
  it("decrypts the key, injects the language directive, and picks the light model for light tasks", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ choices: [{ message: { content: "ok" } }] }));
    const result = await runAiTask(credential("OPENAI", { defaultModel: "gpt-4o" }), { task: "tag_suggestion", prompt: "hello", language: "VI" }, fetchMock as unknown as typeof fetch);
    expect(result).toEqual({ text: "ok", model: "gpt-4o-mini", tier: "LIGHT" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${SECRET}`);
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages[0].content).toContain("Vietnamese");
    expect(JSON.stringify(body.messages[1].content)).toContain("Reminder: respond ONLY in Vietnamese");
  });

  it("cannot decrypt a ciphertext bound to another user, without leaking details", async () => {
    const stolen = { ...credential("OPENAI"), userId: "someone-else" };
    await expect(runAiTask(stolen, { task: "ocr", prompt: "x", language: "EN" }, vi.fn() as unknown as typeof fetch)).rejects.toMatchObject({ code: "BAD_KEY" });
  });

  it("surfaces provider errors without echoing the API key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: { message: `Incorrect API key provided: ${SECRET}` } }, 401));
    const err = await runAiTask(credential("OPENAI", { defaultModel: "gpt-4o-mini" }), { task: "ocr", prompt: "x", language: "EN" }, fetchMock as unknown as typeof fetch).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AiProviderError);
    expect((err as AiProviderError).code).toBe("PROVIDER_HTTP");
    expect((err as AiProviderError).status).toBe(401);
    expect((err as AiProviderError).message).not.toContain(SECRET);
  });

  it("maps network failures and empty replies", async () => {
    const down = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(runAiTask(credential("OPENAI", { defaultModel: "gpt-4o-mini" }), { task: "ocr", prompt: "x", language: "EN" }, down as unknown as typeof fetch)).rejects.toMatchObject({ code: "NETWORK" });
    const empty = vi.fn().mockResolvedValue(jsonResponse({ choices: [] }));
    await expect(runAiTask(credential("OPENAI", { defaultModel: "gpt-4o-mini" }), { task: "ocr", prompt: "x", language: "EN" }, empty as unknown as typeof fetch)).rejects.toMatchObject({ code: "EMPTY" });
  });
});

describe("runAiJson", () => {
  const schema = z.object({ explanation: z.string() });
  const reply = (content: string) => jsonResponse({ choices: [{ message: { content } }] });
  const cred = () => credential("OPENAI", { defaultModel: "gpt-4o" });
  const vi_text = "Hàm số đồng biến vì đạo hàm luôn dương trên toàn bộ khoảng xác định của nó.";
  const en_text = "The function is increasing because its derivative is always positive on the whole domain.";

  it("parses fenced JSON and validates it with zod", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply("```json\n" + JSON.stringify({ explanation: vi_text }) + "\n```"));
    const out = await runAiJson(cred(), { task: "synthesis", prompt: "p", language: "VI" }, schema, fetchMock as unknown as typeof fetch);
    expect(out.data.explanation).toBe(vi_text);
    expect(out.tier).toBe("HEAVY");
  });

  it("retries once when the output language drifts, then succeeds", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply(JSON.stringify({ explanation: en_text }))).mockResolvedValueOnce(reply(JSON.stringify({ explanation: vi_text })));
    const out = await runAiJson(cred(), { task: "synthesis", prompt: "p", language: "VI" }, schema, fetchMock as unknown as typeof fetch);
    expect(out.data.explanation).toBe(vi_text);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up with LANGUAGE_DRIFT / INVALID_JSON after the retry", async () => {
    const drift = vi.fn().mockImplementation(async () => reply(JSON.stringify({ explanation: en_text })));
    await expect(runAiJson(cred(), { task: "synthesis", prompt: "p", language: "VI" }, schema, drift as unknown as typeof fetch)).rejects.toMatchObject({ code: "LANGUAGE_DRIFT" });
    const garbage = vi.fn().mockImplementation(async () => reply("not json"));
    await expect(runAiJson(cred(), { task: "synthesis", prompt: "p", language: "EN" }, schema, garbage as unknown as typeof fetch)).rejects.toMatchObject({ code: "INVALID_JSON" });
  });
});

describe("request timeout", () => {
  it("cuts a hanging Gemini connection test after 10 seconds and reports TIMEOUT, not a crash", async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = hangingFetch();
      const pending = runAiTask(credential("GEMINI", { defaultModel: "gemini-3.8-flash" }), { task: "connection_test", prompt: "ok", language: "EN" }, fetchMock).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(CONNECTION_TEST_TIMEOUT_MS - 1);
      expect(vi.getTimerCount()).toBe(1); // still waiting
      await vi.advanceTimersByTimeAsync(2);
      const err = await pending;
      expect(err).toBeInstanceOf(AiProviderError);
      expect(err).toMatchObject({ code: "TIMEOUT" });
      expect(vi.getTimerCount()).toBe(0); // the timer is always cleared
    } finally {
      vi.useRealTimers();
    }
  });
  it("keeps the connection test at 10 s and real tasks on their longer tier limits", () => {
    expect(CONNECTION_TEST_TIMEOUT_MS).toBe(10_000);
    expect(timeoutFor("connection_test", "LIGHT")).toBe(10_000);
    expect(timeoutFor("ocr", "LIGHT")).toBeGreaterThan(10_000);
    expect(timeoutFor("synthesis", "HEAVY")).toBeGreaterThan(timeoutFor("ocr", "LIGHT"));
  });
  it("still reports NETWORK for an ordinary connection failure, and clears its timer", async () => {
    vi.useFakeTimers();
    try {
      const failing = vi.fn().mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch;
      const err = await runAiTask(credential("OPENAI", { defaultModel: "gpt-4o-mini" }), { task: "ocr", prompt: "x", language: "EN" }, failing).catch((e: unknown) => e);
      expect(err).toMatchObject({ code: "NETWORK" });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
