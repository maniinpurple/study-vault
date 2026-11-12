"use client";

import type { Repository } from "@/lib/repo/types";

export const DEMO_ACCOUNT_ID = "local-minh-anh";
const FLAG = "vl:demo-keys-seeded";

/**
 * Adds two clearly-labelled placeholder keys to the demo account so the vault UI has data on first run.
 * They are encrypted by the real server route; the plaintext is a throwaway string that fails provider validation
 * (which doubles as a demo of the error state). Skipped silently if the server can't encrypt.
 */
export async function seedDemoKeys(repo: Repository): Promise<void> {
  try {
    if (localStorage.getItem(FLAG)) return;
    const snapshot = await repo.loadSnapshot(DEMO_ACCOUNT_ID);
    if (!snapshot) return;
    localStorage.setItem(FLAG, "1");
    if (snapshot.apiKeys.length > 0) return;
    const demos = [
      { provider: "GEMINI", label: "Gemini (demo)", plaintext: "demo-placeholder-gemini-0000", model: "gemini-2.5-flash", language: null },
      { provider: "OPENAI", label: "OpenAI (demo)", plaintext: "demo-placeholder-openai-0000", model: "gpt-4o-mini", language: "EN" },
    ] as const;
    for (const demo of demos) {
      const res = await fetch("/api/vault/encrypt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: DEMO_ACCOUNT_ID, provider: demo.provider, apiKey: demo.plaintext }),
      });
      if (!res.ok) continue;
      const enc = (await res.json()) as { encryptedKey: string; encryptionKeyId: string; keyHint: string };
      await repo.createApiKey(DEMO_ACCOUNT_ID, {
        provider: demo.provider,
        label: demo.label,
        encryptedKey: enc.encryptedKey,
        encryptionKeyId: enc.encryptionKeyId,
        keyHint: enc.keyHint,
        defaultModel: demo.model,
        aiOutputLanguage: demo.language,
      });
    }
  } catch {
    /* demo data is best-effort */
  }
}
