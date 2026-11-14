/**
 * Entity shapes as the app sees them + the repository contract. Field names mirror prisma/schema.prisma (Dates are
 * real `Date`s); secrets (`passwordHash`, encrypted API keys) are deliberately absent. The contract is implemented
 * by `PrismaRepository` on the server; the browser reaches it only through the server actions in `src/server`.
 */
import type {
  AiProvider, ExamPrepStatus, FileKind, Language, OcrStatus, SuggestionStatus, SynthesisMode, TagAssigner, TagDeclineReason, TagOrigin, TagSuggestionKind,
  ThemePreference, UserRole,
} from "@/lib/constants";
import type { CardState, RatingName } from "@/lib/fsrs";

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  uiLanguage: Language;
  defaultAiOutputLanguage: Language;
  theme: ThemePreference;
  timezone: string;
  desiredRetention: number;
  onboardedAt: Date | null;
  lastActiveAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserApiKey {
  id: string;
  userId: string;
  provider: AiProvider;
  label: string;
  /** Last 4 characters of the key. The key itself (stored encrypted) never leaves the server. */
  keyHint: string;
  baseUrl: string | null;
  defaultModel: string | null;
  visionModel: string | null;
  /** Null = "Follow subject default". */
  aiOutputLanguage: Language | null;
  isDefault: boolean;
  isActive: boolean;
  lastUsedAt: Date | null;
  lastValidatedAt: Date | null;
  lastErrorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Subject {
  id: string;
  userId: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  aiOutputLanguage: Language | null;
  preferredApiKeyId: string | null;
  examDate: Date | null;
  sortOrder: number;
  memorySummary: string | null;
  /** Structured per-subject insights produced by "Re-sync AI Memory" (Prisma `memoryInsights` Json). */
  memoryInsights: SubjectMemoryInsights | null;
  memoryVersion: number;
  memorySourceCardCount: number;
  memoryStale: boolean;
  memoryUpdatedAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Shape of `Subject.memoryInsights`. Every list is short, compressed prose (one idea per entry). */
export interface SubjectMemoryInsights {
  /** Mistakes the learner has demonstrably overcome (later attempts fixed them). */
  overcome: string[];
  /** Chronic blind spots that keep coming back. */
  blindSpots: string[];
  /** How the learner thinks / approaches problems (habits, typical reasoning). */
  thinkingPatterns: string[];
  /** What the teacher stressed (high-yield cards & teacher notes). */
  teacherEmphasis: string[];
  /** What to drill next. */
  nextFocus: string[];
}

export interface Topic {
  id: string;
  userId: string;
  subjectId: string;
  parentId: string | null;
  name: string;
  slug: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Crop geometry normalised to the source page (0–1). `page` is 1-based. */
export interface CropBox {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ExamUpload {
  id: string;
  userId: string;
  subjectId: string | null;
  title: string;
  sourceLabel: string | null;
  fileKind: FileKind;
  mimeType: string;
  /** External object-storage bucket; null while files live in `stored_files`. */
  storageBucket: string | null;
  storagePath: string;
  /** IMAGE uploads: one path per page in page order (`storagePath` is the first); empty for PDFs. */
  pageStoragePaths: string[];
  fileSizeBytes: number;
  pageCount: number | null;
  sha256: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdaptiveTag {
  id: string;
  userId: string;
  subjectId: string | null;
  scopeKey: string;
  name: string;
  slug: string;
  i18nKey: string | null;
  description: string | null;
  color: string | null;
  origin: TagOrigin;
  usageCount: number;
  mergedIntoId: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MistakeCardTag {
  cardId: string;
  tagId: string;
  assignedBy: TagAssigner;
  confidence: number | null;
  createdAt: Date;
}

export interface MistakeCard {
  id: string;
  userId: string;
  subjectId: string;
  topicId: string | null;
  examUploadId: string | null;
  title: string | null;
  questionLatex: string;
  userAnswerLatex: string | null;
  correctAnswerLatex: string | null;
  solutionLatex: string | null;
  sourcePage: number | null;
  cropBox: CropBox | null;
  figureBox: CropBox | null;
  /** Storage path (see `Repository.getBlob`) of the preserved figure/graph crop. */
  diagramImagePath: string | null;
  /** Storage path of the untouched original crop, for side-by-side verification. */
  originalCropPath: string | null;
  ocrStatus: OcrStatus;
  ocrModel: string | null;
  ocrConfidence: number | null;
  ocrRawText: string | null;
  ahaNote: string | null;
  isHighYield: boolean;
  highYieldNote: string | null;
  state: CardState;
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  lastReviewAt: Date | null;
  attemptCount: number;
  isSuspended: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CardAttemptLog {
  id: string;
  userId: string;
  cardId: string;
  attemptNumber: number;
  rating: RatingName;
  note: string | null;
  timeSpentMs: number | null;
  /** The AI "mutate numbers" variant this attempt was answered on; null = the original question. */
  variantQuestionLatex: string | null;
  reviewedAt: Date;
  stateBefore: CardState;
  stateAfter: CardState;
  stabilityBefore: number;
  stabilityAfter: number;
  difficultyBefore: number;
  difficultyAfter: number;
  retrievability: number | null;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  dueBefore: Date;
  dueAfter: Date;
}

/** One declined tag suggestion, remembered in the persona so future suggestions adapt. */
export interface TagFeedbackEntry {
  /** ISO timestamp. */
  at: string;
  subjectId: string | null;
  kind: TagSuggestionKind;
  proposedName: string | null;
  reason: TagDeclineReason;
  detail: string | null;
}

/** Shape of `UserAiPersona.preferences`. */
export interface PersonaPreferences {
  /** Most recent declines first; capped (see `rememberTagFeedback`). */
  tagFeedback?: TagFeedbackEntry[];
}

/** "Second Brain" global learner persona (1:1 with the user). Hidden from the main UI; inspectable in the memory modal. */
export interface UserAiPersona {
  id: string;
  userId: string;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  learningHabits: Record<string, unknown> | null;
  preferences: PersonaPreferences | null;
  version: number;
  sourceAttemptCount: number;
  isStale: boolean;
  lastSyncedAt: Date | null;
  lastSyncModel: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TagSuggestionFeedback {
  id: string;
  userId: string;
  subjectId: string | null;
  kind: TagSuggestionKind;
  /** RENAME: tag to rename. MERGE: tag to be merged away. */
  targetTagId: string | null;
  mergeIntoTagId: string | null;
  proposedName: string | null;
  proposedDescription: string | null;
  rationale: string;
  evidenceCardIds: string[];
  status: SuggestionStatus;
  /** `too_specific` | `not_my_intent` | `other: <free text>` (see `formatDeclineReason`). */
  rejectionReason: string | null;
  resultingTagId: string | null;
  aiProvider: AiProvider | null;
  aiModel: string | null;
  outputLanguage: Language;
  createdAt: Date;
  resolvedAt: Date | null;
}

/** A saved exam scope ("Giữa kỳ", "TSA only" …) for the synthesizer. Empty arrays = no filter on that dimension. */
export interface ExamPrepSession {
  id: string;
  userId: string;
  subjectId: string;
  title: string;
  examDate: Date | null;
  topicIds: string[];
  tagIds: string[];
  fromDate: Date | null;
  toDate: Date | null;
  highYieldOnly: boolean;
  includeSynthesized: boolean;
  targetProblemCount: number | null;
  status: ExamPrepStatus;
  createdAt: Date;
  updatedAt: Date;
}

/** AI-generated practice problem. Always rendered with the experimental badge. */
export interface AiSynthesizedProblem {
  id: string;
  userId: string;
  subjectId: string;
  topicId: string | null;
  examPrepSessionId: string | null;
  mode: SynthesisMode;
  questionLatex: string;
  answerLatex: string | null;
  solutionLatex: string | null;
  diagramDescription: string | null;
  difficultyEstimate: number | null;
  verificationLatex: string | null;
  revision: number;
  isExperimental: boolean;
  usedHighYield: boolean;
  outputLanguage: Language;
  apiKeyId: string | null;
  aiProvider: AiProvider;
  aiModel: string;
  promptVersion: string;
  userRating: number | null;
  isFlaggedIncorrect: boolean;
  flagReason: string | null;
  promotedCardId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AiSynthesizedProblemSource {
  problemId: string;
  cardId: string;
  position: number;
}

export interface UserSnapshot {
  user: User;
  subjects: Subject[];
  topics: Topic[];
  apiKeys: UserApiKey[];
  cards: MistakeCard[];
  logs: CardAttemptLog[];
  tags: AdaptiveTag[];
  cardTags: MistakeCardTag[];
  examUploads: ExamUpload[];
  persona: UserAiPersona | null;
  tagSuggestions: TagSuggestionFeedback[];
  examPrepSessions: ExamPrepSession[];
  synthesizedProblems: AiSynthesizedProblem[];
  synthesisSources: AiSynthesizedProblemSource[];
}

export type NewSubject = Pick<Subject, "name"> & Partial<Pick<Subject, "description" | "color" | "icon" | "aiOutputLanguage" | "examDate" | "preferredApiKeyId">>;
export type SubjectPatch = Partial<Pick<Subject, "name" | "description" | "color" | "icon" | "aiOutputLanguage" | "examDate" | "preferredApiKeyId" | "archivedAt">>;
export type NewApiKey = Pick<UserApiKey, "provider" | "label"> &
  Partial<Pick<UserApiKey, "baseUrl" | "defaultModel" | "visionModel" | "aiOutputLanguage" | "isDefault">> & {
    /** Plaintext provider key. Sent once, encrypted on the server (AES-256-GCM), never stored or returned in the clear. */
    apiKey: string;
  };
export type ApiKeyPatch = Partial<
  Pick<UserApiKey, "label" | "baseUrl" | "defaultModel" | "visionModel" | "aiOutputLanguage" | "isDefault" | "isActive" | "lastUsedAt" | "lastValidatedAt" | "lastErrorMessage">
>;
export type UserPatch = Partial<Pick<User, "displayName" | "uiLanguage" | "defaultAiOutputLanguage" | "theme" | "timezone" | "desiredRetention" | "lastActiveAt">>;

export interface NewExamUpload {
  title: string;
  sourceLabel?: string | null;
  subjectId?: string | null;
  fileKind: FileKind;
  mimeType: string;
  fileSizeBytes: number;
  pageCount: number | null;
  /** SHA-256 (hex) of the file bytes. An upload with the same hash for the same user is reused, not duplicated. */
  sha256: string;
  /** The exam's file(s) in page order: exactly one for a PDF, one per page for photos. */
  files: Blob[];
  /** Small JPEG of page 1 for the Sources library (stored at `uploadThumbnailPath`). */
  thumbnail?: Blob | null;
}

export type UploadPatch = Partial<Pick<ExamUpload, "title" | "sourceLabel" | "subjectId">>;

/** A problem to save: snipped from a source (`examUploadId` + `cropBox`) or added on its own. Needs text or an image. */
export interface NewProblem {
  subjectId: string;
  topicId?: string | null;
  examUploadId?: string | null;
  title?: string | null;
  /** Markdown + LaTeX. May be empty when `originalCrop` carries the question as an image. */
  questionLatex: string;
  ahaNote?: string | null;
  /** Correct answer / worked solution (Markdown + KaTeX), stored as `solutionLatex`. */
  solutionLatex?: string | null;
  /** Teacher meta-note. */
  highYieldNote?: string | null;
  isHighYield?: boolean;
  tagIds?: string[];
  sourcePage?: number | null;
  cropBox?: CropBox | null;
  figureBox?: CropBox | null;
  originalCrop?: Blob | null;
  diagramImage?: Blob | null;
  ocrStatus?: OcrStatus;
  ocrModel?: string | null;
  ocrConfidence?: number | null;
  ocrRawText?: string | null;
}

export interface ReviewInput {
  cardId: string;
  rating: RatingName;
  reviewedAt: Date;
  note?: string | null;
  variantQuestionLatex?: string | null;
  timeSpentMs?: number | null;
}

export type CardPatch = Partial<
  Pick<MistakeCard, "title" | "questionLatex" | "solutionLatex" | "ahaNote" | "highYieldNote" | "isHighYield" | "topicId" | "isSuspended" | "ocrStatus" | "ocrModel" | "ocrConfidence" | "ocrRawText">
>;

export interface SubjectMemoryInput {
  memorySummary: string;
  memoryInsights: SubjectMemoryInsights | null;
  /** "sync" = rebuilt by the AI from the subject's cards (clears `memoryStale`); "edit" = the user corrected it by hand. */
  source: "sync" | "edit";
  memorySourceCardCount?: number;
}

export type PersonaPatch = Partial<Pick<UserAiPersona, "summary" | "strengths" | "weaknesses" | "learningHabits" | "lastSyncModel" | "sourceAttemptCount">> & {
  /** True when the AI rebuilt the persona (bumps `version`, stamps `lastSyncedAt`, clears `isStale`). */
  synced?: boolean;
};

export interface NewTagSuggestion {
  kind: Exclude<TagSuggestionKind, "MERGE">;
  targetTagId?: string | null;
  proposedName: string;
  proposedDescription?: string | null;
  rationale: string;
  evidenceCardIds: string[];
  aiProvider: AiProvider | null;
  aiModel: string | null;
  outputLanguage: Language;
}

export type NewExamPrepSession = Pick<ExamPrepSession, "subjectId" | "title"> & Partial<Pick<ExamPrepSession, "topicIds" | "tagIds" | "highYieldOnly" | "examDate">>;

export interface NewSynthesizedProblem {
  subjectId: string;
  topicId?: string | null;
  examPrepSessionId?: string | null;
  mode: SynthesisMode;
  questionLatex: string;
  answerLatex?: string | null;
  solutionLatex?: string | null;
  diagramDescription?: string | null;
  difficultyEstimate?: number | null;
  verificationLatex?: string | null;
  usedHighYield: boolean;
  outputLanguage: Language;
  apiKeyId?: string | null;
  aiProvider: AiProvider;
  aiModel: string;
  promptVersion: string;
  /** Source cards in prompt order. */
  sourceCardIds: string[];
}

export type SynthesizedProblemPatch = Partial<
  Pick<AiSynthesizedProblem, "questionLatex" | "answerLatex" | "solutionLatex" | "verificationLatex" | "diagramDescription" | "difficultyEstimate" | "isFlaggedIncorrect" | "flagReason" | "userRating" | "aiModel">
> & {
  /** True when the patch is an AI correction (bumps `revision`). */
  revised?: boolean;
};

/** A stored file as the server returns it. */
export interface StoredBlob {
  data: Uint8Array;
  mimeType: string;
}

/** Decrypt-ready provider credential for one of the user's API keys (server-only use). */
export interface ApiKeyCredential {
  userId: string;
  provider: AiProvider;
  encryptedKey: string;
  baseUrl: string | null;
  defaultModel: string | null;
  visionModel: string | null;
}

/**
 * Data access contract. Every method takes the signed-in user's id first and touches only that user's rows:
 * each query carries `userId` in its `where`, so one user can never read or change another's data.
 */
export interface Repository {
  loadSnapshot(userId: string): Promise<UserSnapshot | null>;
  updateUser(userId: string, patch: UserPatch): Promise<User>;

  createSubject(userId: string, input: NewSubject): Promise<Subject>;
  updateSubject(userId: string, id: string, patch: SubjectPatch): Promise<Subject>;
  /** Deletes the subject and (cascading) its topics, cards, attempt logs, tags and generated problems. */
  deleteSubject(userId: string, id: string): Promise<void>;

  createTopic(userId: string, input: { subjectId: string; name: string; parentId?: string | null }): Promise<Topic>;
  updateTopic(userId: string, id: string, patch: { name?: string; sortOrder?: number }): Promise<Topic>;
  /** Deletes the topic and its descendants; cards keep existing with `topicId = null`. */
  deleteTopic(userId: string, id: string): Promise<void>;

  /** Encrypts the plaintext key and stores only the ciphertext + a 4-character hint. */
  createApiKey(userId: string, input: NewApiKey): Promise<UserApiKey>;
  updateApiKey(userId: string, id: string, patch: ApiKeyPatch): Promise<UserApiKey>;
  deleteApiKey(userId: string, id: string): Promise<void>;
  /** The stored ciphertext of one of the user's active keys, for server-side AI calls. Null when it is not theirs. */
  getApiKeyCredential(userId: string, id: string): Promise<ApiKeyCredential | null>;

  /** Store an exam file as a source. An upload with the same sha256 is reused, not duplicated. */
  createUpload(userId: string, input: NewExamUpload): Promise<ExamUpload>;
  updateUpload(userId: string, id: string, patch: UploadPatch): Promise<ExamUpload>;
  /** Deletes the source and its files; problems snipped from it are kept (their `examUploadId` becomes null). */
  deleteUpload(userId: string, id: string): Promise<void>;
  /** Create one NEW-state MistakeCard with its crop blobs and tag links. Never needs an AI key. Flags the subject memory stale. */
  createCard(userId: string, input: NewProblem): Promise<MistakeCard>;
  /** Deletes the card with its attempt logs, tag links, stored crops and synthesis source links. */
  deleteCard(userId: string, id: string): Promise<void>;
  /** A stored image/file by the path kept on a card or upload. Null when it does not exist or belongs to someone else. */
  getBlob(userId: string, path: string): Promise<StoredBlob | null>;

  /** FSRS-grade a card (zero AI): updates scheduling, appends the next sequential `CardAttemptLog`, marks subject memory stale. */
  reviewCard(userId: string, input: ReviewInput): Promise<{ card: MistakeCard; log: CardAttemptLog }>;
  updateCard(userId: string, id: string, patch: CardPatch): Promise<MistakeCard>;
  /** Replace the card's tag set (tags must be visible in the card's subject). */
  setCardTags(userId: string, cardId: string, tagIds: string[]): Promise<void>;

  saveSubjectMemory(userId: string, subjectId: string, input: SubjectMemoryInput): Promise<Subject>;
  updatePersona(userId: string, patch: PersonaPatch): Promise<UserAiPersona>;

  /** Store validated AI suggestions as PENDING (duplicates of existing tags / previously declined names are dropped). */
  addTagSuggestions(userId: string, subjectId: string, suggestions: NewTagSuggestion[]): Promise<TagSuggestionFeedback[]>;
  acceptTagSuggestion(userId: string, id: string): Promise<AdaptiveTag>;
  /** Decline with a reason; the reason is also remembered in the persona so future prompts adapt. */
  rejectTagSuggestion(userId: string, id: string, reason: TagDeclineReason, detail?: string | null): Promise<void>;

  createExamPrepSession(userId: string, input: NewExamPrepSession): Promise<ExamPrepSession>;
  deleteExamPrepSession(userId: string, id: string): Promise<void>;
  saveSynthesizedProblem(userId: string, input: NewSynthesizedProblem): Promise<AiSynthesizedProblem>;
  updateSynthesizedProblem(userId: string, id: string, patch: SynthesizedProblemPatch): Promise<AiSynthesizedProblem>;
  /** Turn an AI problem into a real NEW-state MistakeCard in the same subject. */
  promoteSynthesizedProblem(userId: string, id: string): Promise<MistakeCard>;
  deleteSynthesizedProblem(userId: string, id: string): Promise<void>;
}

/** An expected, user-facing failure of a repository call. `code` is what the browser receives. */
export class RepoError extends Error {
  constructor(
    readonly code: string,
    message: string = code,
  ) {
    super(message);
    this.name = "RepoError";
  }
}
