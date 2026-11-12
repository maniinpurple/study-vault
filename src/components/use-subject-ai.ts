"use client";

import { useVault } from "@/components/app-provider";
import { AiRequestError, type AiCall } from "@/lib/ai-client";
import { aiLanguageFor, pickAiKey } from "@/lib/ai-keys";
import type { Dictionary } from "@/lib/i18n";
import type { Subject } from "@/lib/repo/types";

/** BYOK key + AI output language for a subject (Subject → key → account default), and a call descriptor. */
export function useSubjectAi(subject: Subject | null) {
  const { snapshot, user } = useVault();
  const key = pickAiKey(snapshot.apiKeys, subject);
  const language = aiLanguageFor(subject, key, user);
  const call = (signal?: AbortSignal): AiCall | null => (key ? { userId: user.id, key, language, signal } : null);
  return { key, language, call };
}

/** Localised message for an AI failure (error codes come from the server routes or the client wrapper). */
export function aiErrorMessage(t: Dictionary, err: unknown): string {
  const code = err instanceof AiRequestError ? err.code : "UNKNOWN";
  return (t.ai.errors as Record<string, string>)[code] ?? t.ai.errors.UNKNOWN;
}
