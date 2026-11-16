/**
 * zod schemas for everything the browser sends to a data action or upload route. Server actions are public HTTP
 * endpoints, so their arguments are untrusted input no matter what the TypeScript signature says.
 */
import { z } from "zod";

import { mappedSuggestionSchema, memorySyncResponseSchema } from "@/lib/brain-prompt";
import { MAX_STITCH_PARTS } from "@/lib/stitch";
import { AI_PROVIDERS, FILE_KINDS, LANGUAGES, OCR_STATUSES, SCAN_LIMITS, SYNTHESIS_MODES, TAG_DECLINE_REASONS, THEMES } from "@/lib/constants";

export const idSchema = z.uuid();
const language = z.enum(LANGUAGES);
const text = (max: number) => z.string().max(max);
const optionalText = (max: number) => text(max).nullable().optional();
const optionalId = idSchema.nullable().optional();

export const profilePatchSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  uiLanguage: language.optional(),
  defaultAiOutputLanguage: language.optional(),
  theme: z.enum(THEMES).optional(),
  timezone: text(64).optional(),
});

const subjectFields = {
  name: z.string().trim().min(1).max(80),
  description: optionalText(300),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  icon: optionalText(40),
  aiOutputLanguage: language.nullable().optional(),
  examDate: z.date().nullable().optional(),
  preferredApiKeyId: optionalId,
};
export const newSubjectSchema = z.object(subjectFields);
export const subjectPatchSchema = z.object({ ...subjectFields, name: subjectFields.name.optional(), archivedAt: z.date().nullable().optional() });

export const newTopicSchema = z.object({ subjectId: idSchema, name: z.string().trim().min(1).max(80), parentId: optionalId });
export const topicNameSchema = z.string().trim().min(1).max(80);

export const newApiKeySchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  label: z.string().trim().min(1).max(60),
  apiKey: z.string().trim().min(8).max(512),
  baseUrl: optionalText(512),
  defaultModel: optionalText(128),
  visionModel: optionalText(128),
  aiOutputLanguage: language.nullable().optional(),
  isDefault: z.boolean().optional(),
});
export const apiKeyPatchSchema = z.object({
  label: z.string().trim().min(1).max(60).optional(),
  baseUrl: optionalText(512),
  defaultModel: optionalText(128),
  visionModel: optionalText(128),
  aiOutputLanguage: language.nullable().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  lastUsedAt: z.date().nullable().optional(),
  lastValidatedAt: z.date().nullable().optional(),
  lastErrorMessage: optionalText(300),
});

/** A calendar day, `YYYY-MM-DD`. */
const calendarDay = z.iso.date();

export const uploadPatchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  sourceLabel: optionalText(160),
  subjectId: optionalId,
  completed: z.boolean().optional(),
  deadline: calendarDay.nullable().optional(),
});

/** Metadata of an uploaded source (the files travel next to it as multipart parts). */
export const newUploadMetaSchema = z.object({
  title: z.string().trim().min(1).max(120),
  subjectId: optionalId,
  completed: z.boolean().optional(),
  deadline: calendarDay.nullable().optional(),
  fileKind: z.enum(FILE_KINDS),
  pageCount: z.number().int().min(1).max(SCAN_LIMITS.maxPdfPages).nullable(),
});

const cropRegion = z.object({ page: z.number().int().min(1).max(SCAN_LIMITS.maxPdfPages), x: z.number().min(0).max(1), y: z.number().min(0).max(1), w: z.number().min(0).max(1), h: z.number().min(0).max(1) });
const cropBox = cropRegion.extend({ more: z.array(cropRegion).max(MAX_STITCH_PARTS - 1).optional() });

/** A new problem without its images (those travel as multipart parts). */
export const newProblemMetaSchema = z.object({
  subjectId: idSchema,
  topicId: optionalId,
  examUploadId: optionalId,
  title: optionalText(200),
  questionLatex: text(20_000),
  solutionLatex: optionalText(20_000),
  ahaNote: optionalText(4000),
  highYieldNote: optionalText(4000),
  isHighYield: z.boolean().optional(),
  needsReview: z.boolean().optional(),
  tagIds: z.array(idSchema).max(40).optional(),
  sourcePage: z.number().int().min(1).max(SCAN_LIMITS.maxPdfPages).nullable().optional(),
  cropBox: cropBox.nullable().optional(),
  figureBox: cropBox.nullable().optional(),
});

export const cardPatchSchema = z.object({
  title: optionalText(200),
  questionLatex: text(20_000).optional(),
  solutionLatex: optionalText(20_000),
  ahaNote: optionalText(4000),
  highYieldNote: optionalText(4000),
  isHighYield: z.boolean().optional(),
  needsReview: z.boolean().optional(),
  topicId: optionalId,
  isSuspended: z.boolean().optional(),
  ocrStatus: z.enum(OCR_STATUSES).optional(),
  ocrModel: optionalText(128),
  ocrConfidence: z.number().min(0).max(1).nullable().optional(),
  ocrRawText: optionalText(20_000),
});

export const reviewInputSchema = z.object({
  cardId: idSchema,
  rating: z.enum(["AGAIN", "HARD", "GOOD", "EASY"]),
  reviewedAt: z.date(),
  note: optionalText(4000),
  variantQuestionLatex: optionalText(20_000),
  timeSpentMs: z.number().finite().nullable().optional(),
});

export const tagIdsSchema = z.array(idSchema).max(40);

// Hand-edited memory: looser than the AI contract (the repository trims and caps it).
const insightList = z.array(text(2000)).max(24);
const editableInsights = z.object({ overcome: insightList, blindSpots: insightList, thinkingPatterns: insightList, teacherEmphasis: insightList, nextFocus: insightList });

export const subjectMemorySchema = z.object({
  memorySummary: text(8000),
  memoryInsights: editableInsights.nullable(),
  source: z.enum(["sync", "edit"]),
  memorySourceCardCount: z.number().int().min(0).max(1_000_000).optional(),
});

const shortList = z.array(text(400)).max(12);
export const personaPatchSchema = z.object({
  summary: text(4000).optional(),
  strengths: shortList.optional(),
  weaknesses: shortList.optional(),
  lastSyncModel: optionalText(128),
  sourceAttemptCount: z.number().int().min(0).max(10_000_000).optional(),
});

const suggestionMeta = z.object({ aiProvider: z.enum(AI_PROVIDERS).nullable(), aiModel: text(128).nullable(), outputLanguage: language });
export const newTagSuggestionsSchema = z.array(mappedSuggestionSchema.extend(suggestionMeta.shape)).max(6);

export const memorySyncApplySchema = z.object({
  result: memorySyncResponseSchema,
  meta: z.object({ sourceCardCount: z.number().int().min(0).max(1_000_000), sourceAttemptCount: z.number().int().min(0).max(10_000_000), suggestionMeta }),
});

export const declineSchema = z.object({ reason: z.enum(TAG_DECLINE_REASONS), detail: optionalText(400) });

export const newExamPrepSchema = z.object({
  subjectId: idSchema,
  title: z.string().trim().min(1).max(120),
  topicIds: z.array(idSchema).max(400).optional(),
  tagIds: z.array(idSchema).max(80).optional(),
  highYieldOnly: z.boolean().optional(),
  examDate: z.date().nullable().optional(),
});

export const newSynthesizedProblemSchema = z.object({
  subjectId: idSchema,
  topicId: optionalId,
  examPrepSessionId: optionalId,
  mode: z.enum(SYNTHESIS_MODES),
  questionLatex: z.string().min(1).max(40_000),
  answerLatex: optionalText(40_000),
  solutionLatex: optionalText(40_000),
  diagramDescription: optionalText(4000),
  difficultyEstimate: z.number().min(0).max(10).nullable().optional(),
  verificationLatex: optionalText(40_000),
  usedHighYield: z.boolean(),
  outputLanguage: language,
  apiKeyId: optionalId,
  aiProvider: z.enum(AI_PROVIDERS),
  aiModel: z.string().min(1).max(128),
  promptVersion: z.string().min(1).max(40),
  sourceCardIds: z.array(idSchema).min(1).max(3),
});

export const synthesizedProblemPatchSchema = z.object({
  questionLatex: z.string().min(1).max(40_000).optional(),
  answerLatex: optionalText(40_000),
  solutionLatex: optionalText(40_000),
  verificationLatex: optionalText(40_000),
  diagramDescription: optionalText(4000),
  difficultyEstimate: z.number().min(0).max(10).nullable().optional(),
  isFlaggedIncorrect: z.boolean().optional(),
  flagReason: optionalText(2000),
  userRating: z.number().int().min(1).max(5).nullable().optional(),
  aiModel: z.string().min(1).max(128).optional(),
  revised: z.boolean().optional(),
});

/** File types a user may store. Anything else is refused on upload and never served with its own type. */
export const SOURCE_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"] as const;
export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
