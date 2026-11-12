import type { AdaptiveTag, CardAttemptLog, MistakeCard, MistakeCardTag, Subject, Topic } from "@/lib/repo/types";

export const T0 = new Date("2026-11-12T10:00:00.000Z");
const DAY = 86_400_000;

export const daysFrom = (base: Date, days: number) => new Date(base.getTime() + days * DAY);

export function card(id: string, patch: Partial<MistakeCard> = {}): MistakeCard {
  return {
    id, userId: "u1", subjectId: "s1", topicId: null, examUploadId: null, title: null, questionLatex: `Question ${id}: $x^2 = 4$`, userAnswerLatex: null,
    correctAnswerLatex: null, solutionLatex: null, sourcePage: null, cropBox: null, figureBox: null, diagramImagePath: null, originalCropPath: null, ocrStatus: "MANUAL",
    ocrModel: null, ocrConfidence: null, ocrRawText: null, ahaNote: null, isHighYield: false, highYieldNote: null, state: "NEW", due: T0, stability: 0, difficulty: 0,
    elapsedDays: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0, lastReviewAt: null, attemptCount: 0, isSuspended: false, archivedAt: null,
    createdAt: daysFrom(T0, -30), updatedAt: T0, ...patch,
  };
}

export function log(cardId: string, attemptNumber: number, patch: Partial<CardAttemptLog> = {}): CardAttemptLog {
  const reviewedAt = daysFrom(T0, -10 + attemptNumber);
  return {
    id: `${cardId}-log-${attemptNumber}`, userId: "u1", cardId, attemptNumber, rating: "GOOD", note: null, timeSpentMs: null, variantQuestionLatex: null, reviewedAt,
    stateBefore: attemptNumber === 1 ? "NEW" : "REVIEW", stateAfter: "REVIEW", stabilityBefore: 1, stabilityAfter: 2, difficultyBefore: 5, difficultyAfter: 5,
    retrievability: null, elapsedDays: 1, scheduledDays: 2, learningSteps: 0, dueBefore: reviewedAt, dueAfter: daysFrom(reviewedAt, 2), ...patch,
  };
}

export function topic(id: string, patch: Partial<Topic> = {}): Topic {
  return { id, userId: "u1", subjectId: "s1", parentId: null, name: `Topic ${id}`, slug: id, sortOrder: 0, createdAt: T0, updatedAt: T0, ...patch };
}

export function tag(id: string, patch: Partial<AdaptiveTag> = {}): AdaptiveTag {
  return {
    id, userId: "u1", subjectId: "s1", scopeKey: "s1", name: `Tag ${id}`, slug: id, i18nKey: null, description: null, color: null, origin: "USER", usageCount: 0,
    mergedIntoId: null, archivedAt: null, createdAt: T0, updatedAt: T0, ...patch,
  };
}

export const link = (cardId: string, tagId: string): MistakeCardTag => ({ cardId, tagId, assignedBy: "USER", confidence: null, createdAt: T0 });

export function subject(patch: Partial<Subject> = {}): Subject {
  return {
    id: "s1", userId: "u1", name: "Toán TSA", slug: "toan-tsa", description: "Tư duy định lượng", color: null, icon: null, aiOutputLanguage: "VI", preferredApiKeyId: null,
    examDate: null, sortOrder: 0, memorySummary: null, memoryInsights: null, memoryVersion: 0, memorySourceCardCount: 0, memoryStale: false, memoryUpdatedAt: null,
    archivedAt: null, createdAt: T0, updatedAt: T0, ...patch,
  };
}
