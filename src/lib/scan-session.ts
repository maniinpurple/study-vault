/**
 * Pure helpers for working with sources: which API key reads images, topic grouping, and a small concurrency utility.
 */
import { aiLanguageFor, pickAiKey } from "@/lib/ai-keys";
import type { Topic } from "@/lib/repo/types";

/** Active key to run OCR with: the subject's preferred key → the account default → the oldest active key. */
export const pickOcrKey = pickAiKey;

/** Language for AI output on a scan: Subject → API key → account default (CLAUDE.md §3). */
export const scanAiLanguage = aiLanguageFor;

/** Topics of a subject grouped under their chapters, for a `<select>` with `<optgroup>`s. */
export function groupTopics(topics: readonly Topic[], subjectId: string | null): { chapter: Topic; children: Topic[] }[] {
  if (!subjectId) return [];
  const inSubject = topics.filter((tp) => tp.subjectId === subjectId);
  return inSubject
    .filter((tp) => tp.parentId === null)
    .map((chapter) => ({ chapter, children: inSubject.filter((tp) => tp.parentId === chapter.id) }));
}

/** Run `fn` over `items` with at most `limit` in flight; results keep input order. `fn` must not throw (handle errors inside). */
export async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < items.length; i = next++) results[i] = await fn(items[i], i);
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}
