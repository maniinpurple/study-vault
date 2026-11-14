/**
 * Problems (MistakeCards) as the student sees them — pure helpers shared by the repository, the Sources workspace
 * and the Problem Vault.
 */
import type { ExamUpload, MistakeCard } from "@/lib/repo/types";
import { startOfDay } from "@/lib/stats";

const DAY_MS = 86_400_000;

/** Storage path of the Sources-library thumbnail of an upload (derived, so no column is needed). */
export function uploadThumbnailPath(upload: Pick<ExamUpload, "userId" | "id">): string {
  return `u/${upload.userId}/uploads/${upload.id}/thumb.jpg`;
}

/** The only hard requirements for saving a problem: a subject, and the question as text or as an image. */
export function problemSaveIssue(input: { questionLatex: string; hasImage: boolean; subjectId: string | null }): "EMPTY_QUESTION" | "NO_SUBJECT" | null {
  if (!input.subjectId) return "NO_SUBJECT";
  if (!input.questionLatex.trim() && !input.hasImage) return "EMPTY_QUESTION";
  return null;
}

/** Problems snipped from one source, in reading order: page, then top-to-bottom, then left-to-right. */
export function orderSnips(cards: readonly MistakeCard[], uploadId: string): MistakeCard[] {
  return cards
    .filter((c) => c.examUploadId === uploadId && c.archivedAt === null)
    .sort(
      (a, b) =>
        (a.sourcePage ?? 0) - (b.sourcePage ?? 0) ||
        (a.cropBox?.y ?? 0) - (b.cropBox?.y ?? 0) ||
        (a.cropBox?.x ?? 0) - (b.cropBox?.x ?? 0) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
}

export type ReviewStatus = "new" | "learning" | "due" | "scheduled" | "mastered";
export const REVIEW_STATUSES: readonly ReviewStatus[] = ["due", "new", "learning", "scheduled", "mastered"];

/** Where a problem stands in spaced repetition. "Mastered" = in review with stability of three weeks or more. */
export function reviewStatus(card: MistakeCard, now: Date, utcOffsetMinutes: number): ReviewStatus {
  if (card.state === "NEW") return "new";
  if (card.state === "LEARNING" || card.state === "RELEARNING") return "learning";
  if (card.due.getTime() < startOfDay(now, utcOffsetMinutes).getTime() + DAY_MS) return "due";
  return card.stability >= 21 ? "mastered" : "scheduled";
}
