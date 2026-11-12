/**
 * Pure helpers for the scanner session: which API key to use, draft-card rules, and a small concurrency utility.
 */
import { aiLanguageFor, pickAiKey } from "@/lib/ai-keys";
import type { Topic } from "@/lib/repo/types";

/** Active key to run OCR with: the subject's preferred key → the account default → the oldest active key. */
export const pickOcrKey = pickAiKey;

/** Language for AI output on a scan: Subject → API key → account default (CLAUDE.md §3). */
export const scanAiLanguage = aiLanguageFor;

export interface DraftValidityInput {
  questionLatex: string;
  subjectId: string | null;
}

/** The only hard requirements for saving: some question text and a subject. Every note field is optional. */
export function draftSaveProblem(draft: DraftValidityInput): "EMPTY_QUESTION" | "NO_SUBJECT" | null {
  if (!draft.questionLatex.trim()) return "EMPTY_QUESTION";
  if (!draft.subjectId) return "NO_SUBJECT";
  return null;
}

/** Default card title, e.g. "Midterm · p.3 · Q2". */
export function defaultCardTitle(uploadTitle: string, page: number, questionNumber: number, pageCount: number | null): string {
  const base = uploadTitle.trim().replace(/\.(pdf|png|jpe?g|webp|heic|heif)$/i, "");
  return [base, pageCount && pageCount > 1 ? `p.${page}` : null, `Q${questionNumber}`].filter(Boolean).join(" · ");
}

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
