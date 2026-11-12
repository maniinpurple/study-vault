/**
 * Which BYOK key and which output language an AI feature uses for a subject. Pure and client-safe.
 * Shared by the scanner (OCR), the review arena (mutate), the Second Brain (memory/tags) and the lab (synthesizer).
 */
import { resolveAiOutputLanguage, type Language } from "@/lib/constants";
import type { Subject, User, UserApiKey } from "@/lib/repo/types";

/** Active key for a subject: the subject's preferred key → the account default → the oldest active key. */
export function pickAiKey(keys: readonly UserApiKey[], subject: Pick<Subject, "preferredApiKeyId"> | null): UserApiKey | null {
  const active = keys.filter((k) => k.isActive);
  return (
    (subject?.preferredApiKeyId ? active.find((k) => k.id === subject.preferredApiKeyId) : undefined) ??
    active.find((k) => k.isDefault) ??
    active[0] ??
    null
  );
}

/** AI output language: Subject → API key → account default (CLAUDE.md §3). Independent of the GUI language. */
export function aiLanguageFor(subject: Pick<Subject, "aiOutputLanguage"> | null, key: Pick<UserApiKey, "aiOutputLanguage"> | null, user: Pick<User, "defaultAiOutputLanguage">): Language {
  return resolveAiOutputLanguage({ subject, apiKey: key, user });
}
