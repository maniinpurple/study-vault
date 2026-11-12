import { randomBytes } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import { AiProviderError, type AiCredential } from "@/lib/ai-provider";
import { buildPrompt, languageSystemDirective } from "@/lib/ai-prompt";
import { encryptApiKey } from "@/lib/crypto";
import { runOcr } from "@/lib/ocr";
import { normalizeOcrMarkdown, OCR_SYSTEM_PROMPT, ocrResultSchema } from "@/lib/ocr-prompt";

const USER = "user-1";
const IMAGE = { mimeType: "image/jpeg", data: "QUJD" } as const;
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const openAi = (content: string) => jsonResponse({ choices: [{ message: { content } }] });

function credential(): AiCredential {
  return { userId: USER, provider: "OPENAI", encryptedKey: encryptApiKey("sk-test-0123456789", USER, "OPENAI").encryptedKey, defaultModel: "gpt-4o-mini", visionModel: null, baseUrl: null };
}

beforeAll(() => {
  process.env.VAULT_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

describe("OCR prompt contract", () => {
  it("tells the model to ignore handwriting and markings, keep the language, and skip figures", () => {
    expect(OCR_SYSTEM_PROMPT).toMatch(/handwriting/i);
    expect(OCR_SYSTEM_PROMPT).toMatch(/circles|circled/i);
    expect(OCR_SYSTEM_PROMPT).toMatch(/strike-throughs/i);
    expect(OCR_SYSTEM_PROMPT).toMatch(/never translate/i);
    expect(OCR_SYSTEM_PROMPT).toMatch(/\$\.\.\.\$/);
    expect(OCR_SYSTEM_PROMPT).toMatch(/containsFigure/);
  });
  it("still injects the language directive in verbatim mode, without forcing a translation", () => {
    const built = buildPrompt({ system: OCR_SYSTEM_PROMPT, prompt: "go", language: "VI", verbatim: true });
    expect(built.system).toContain("OUTPUT LANGUAGE (NON-NEGOTIABLE)");
    expect(built.system).toContain("Vietnamese");
    expect(built.system).toMatch(/never translate/i);
    expect(built.prompt).toMatch(/Reminder:/);
    expect(languageSystemDirective("EN", true)).not.toEqual(languageSystemDirective("EN"));
  });
  it("validates the model reply shape", () => {
    expect(ocrResultSchema.parse({ markdown: "x" })).toEqual({ markdown: "x", containsFigure: false });
    expect(ocrResultSchema.safeParse({ markdown: 3 }).success).toBe(false);
    expect(ocrResultSchema.safeParse({ markdown: "x", confidence: 2 }).success).toBe(false);
  });
});

describe("normalizeOcrMarkdown", () => {
  it("converts \\( \\) and \\[ \\] math delimiters", () => {
    expect(normalizeOcrMarkdown("Tính \\(x^2\\) và\n\\[\\int_0^1 x\\,dx\\]")).toBe("Tính $x^2$ và\n$$\\int_0^1 x\\,dx$$");
  });
  it("unwraps a code fence, trims and collapses blank lines", () => {
    expect(normalizeOcrMarkdown("```markdown\nA  \n\n\n\nB\n```")).toBe("A\n\nB");
    expect(normalizeOcrMarkdown("  \r\nhello\r\n  ")).toBe("hello");
  });
});

describe("runOcr", () => {
  it("returns normalised markdown and sends the crop with a JSON request in verbatim mode", async () => {
    const fetchImpl = vi.fn(async () => openAi(JSON.stringify({ markdown: "Giải \\(x+1=2\\)\nA. 1\nB. 2", containsFigure: true, confidence: 0.9 })));
    const out = await runOcr(credential(), IMAGE, "VI", fetchImpl as unknown as typeof fetch);
    expect(out).toEqual({ markdown: "Giải $x+1=2$\nA. 1\nB. 2", containsFigure: true, confidence: 0.9, model: "gpt-4o-mini" });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(JSON.stringify(body)).toContain("data:image/jpeg;base64,QUJD");
    expect(body.messages[0].content).toContain("handwriting");
  });
  it("retries once on invalid JSON, then succeeds", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(openAi("not json at all")).mockResolvedValueOnce(openAi('```json\n{"markdown":"ok"}\n```'));
    const out = await runOcr(credential(), IMAGE, "EN", fetchImpl as unknown as typeof fetch);
    expect(out.markdown).toBe("ok");
    expect(out.containsFigure).toBe(false);
    expect(out.confidence).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(((fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].body as string));
    expect(JSON.stringify(retryBody)).toContain("previous reply was rejected");
  });
  it("gives up after two bad replies and rejects empty transcriptions", async () => {
    const empty = vi.fn(async () => openAi(JSON.stringify({ markdown: "  " })));
    await expect(runOcr(credential(), IMAGE, "VI", empty as unknown as typeof fetch)).rejects.toMatchObject({ code: "INVALID_JSON" });
    expect(empty).toHaveBeenCalledTimes(2);
    const schemaBad = vi.fn(async () => openAi(JSON.stringify({ text: "x" })));
    await expect(runOcr(credential(), IMAGE, "VI", schemaBad as unknown as typeof fetch)).rejects.toBeInstanceOf(AiProviderError);
  });
  it("propagates provider failures without retrying", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: { message: "quota" } }, 429));
    await expect(runOcr(credential(), IMAGE, "VI", fetchImpl as unknown as typeof fetch)).rejects.toMatchObject({ code: "PROVIDER_HTTP", status: 429 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
