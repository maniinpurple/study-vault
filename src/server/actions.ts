"use server";

/**
 * Data actions: the only way the browser reads or changes study data. Each one
 *   1. takes the user id from the verified session (`requireUserId`) — never from its arguments,
 *   2. validates its arguments with zod (a server action is a public endpoint),
 *   3. calls the repository, whose every query is scoped by that user id,
 *   4. returns the result together with the user's fresh snapshot.
 */
import type { z } from "zod";

import { signOut } from "@/auth";
import { SCAN_LIMITS } from "@/lib/constants";
import { VaultError } from "@/lib/crypto";
import {
  RepoError, type AdaptiveTag, type AiSynthesizedProblem, type ApiKeyPatch, type CardAttemptLog, type CardPatch, type ExamPrepSession, type MistakeCard, type NewApiKey,
  type NewExamPrepSession, type NewSubject, type NewSynthesizedProblem, type NewTagSuggestion, type PersonaPatch, type Repository, type ReviewInput, type Subject,
  type SubjectMemoryInput, type SubjectPatch, type SynthesizedProblemPatch, type TagSuggestionFeedback, type Topic, type UploadPatch, type UserApiKey, type UserPatch,
} from "@/lib/repo/types";
import type { MemorySyncResponse } from "@/lib/brain-prompt";
import type { TagDeclineReason } from "@/lib/constants";
import { getRepository } from "@/server/repository";
import type { ActionResult } from "@/server/result";
import {
  apiKeyPatchSchema, cardPatchSchema, declineSchema, idSchema, IMAGE_MIME_TYPES, memorySyncApplySchema, newApiKeySchema, newExamPrepSchema, newProblemMetaSchema, newSubjectSchema,
  newSynthesizedProblemSchema, newTagSuggestionsSchema, newTopicSchema, personaPatchSchema, profilePatchSchema, reviewInputSchema, subjectMemorySchema, subjectPatchSchema,
  synthesizedProblemPatchSchema, tagIdsSchema, topicNameSchema, uploadPatchSchema,
} from "@/server/schemas";
import { requireUserId, UnauthorizedError } from "@/server/session";

class InvalidRequest extends Error {}

/** Parse untrusted input; a mismatch ends the action with `INVALID_REQUEST`. */
function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new InvalidRequest();
  return parsed.data;
}

async function run<T>(work: (repo: Repository, userId: string) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const userId = await requireUserId();
    const repo = getRepository();
    const data = await work(repo, userId);
    const snapshot = await repo.loadSnapshot(userId);
    if (!snapshot) {
      // The session outlived its account (deleted elsewhere): end it so the proxy stops treating it as signed in.
      await signOut({ redirect: false });
      return { ok: false, code: "UNAUTHENTICATED" };
    }
    return { ok: true, data, snapshot };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { ok: false, code: "UNAUTHENTICATED" };
    if (err instanceof InvalidRequest) return { ok: false, code: "INVALID_REQUEST" };
    if (err instanceof RepoError) return { ok: false, code: err.code };
    if (err instanceof VaultError) return { ok: false, code: "ENCRYPT" };
    console.error("[vaultlearn] data action failed", err);
    return { ok: false, code: "INTERNAL" };
  }
}

export async function loadSnapshotAction(): Promise<ActionResult<null>> {
  return run(async () => null);
}

export async function updateProfileAction(patch: UserPatch): Promise<ActionResult<null>> {
  return run(async (repo, userId) => {
    await repo.updateUser(userId, parse(profilePatchSchema, patch));
    return null;
  });
}

// ── Subjects & topics ────────────────────────────────────────────────────────────────────────────────────────────

export async function createSubjectAction(input: NewSubject): Promise<ActionResult<Subject>> {
  return run((repo, userId) => repo.createSubject(userId, parse(newSubjectSchema, input)));
}

export async function updateSubjectAction(id: string, patch: SubjectPatch): Promise<ActionResult<Subject>> {
  return run((repo, userId) => repo.updateSubject(userId, parse(idSchema, id), parse(subjectPatchSchema, patch)));
}

export async function deleteSubjectAction(id: string): Promise<ActionResult<void>> {
  return run((repo, userId) => repo.deleteSubject(userId, parse(idSchema, id)));
}

export async function createTopicAction(input: { subjectId: string; name: string; parentId?: string | null }): Promise<ActionResult<Topic>> {
  return run((repo, userId) => repo.createTopic(userId, parse(newTopicSchema, input)));
}

export async function renameTopicAction(id: string, name: string): Promise<ActionResult<Topic>> {
  return run((repo, userId) => repo.updateTopic(userId, parse(idSchema, id), { name: parse(topicNameSchema, name) }));
}

export async function deleteTopicAction(id: string): Promise<ActionResult<void>> {
  return run((repo, userId) => repo.deleteTopic(userId, parse(idSchema, id)));
}

// ── API keys ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** The plaintext key arrives here once, is encrypted in the repository, and is never returned. */
export async function createApiKeyAction(input: NewApiKey): Promise<ActionResult<UserApiKey>> {
  return run((repo, userId) => repo.createApiKey(userId, parse(newApiKeySchema, input)));
}

export async function updateApiKeyAction(id: string, patch: ApiKeyPatch): Promise<ActionResult<UserApiKey>> {
  return run((repo, userId) => repo.updateApiKey(userId, parse(idSchema, id), parse(apiKeyPatchSchema, patch)));
}

export async function deleteApiKeyAction(id: string): Promise<ActionResult<void>> {
  return run((repo, userId) => repo.deleteApiKey(userId, parse(idSchema, id)));
}

// ── Sources & problems ───────────────────────────────────────────────────────────────────────────────────────────

export async function updateSourceAction(id: string, patch: UploadPatch): Promise<ActionResult<null>> {
  return run(async (repo, userId) => {
    await repo.updateUpload(userId, parse(idSchema, id), parse(uploadPatchSchema, patch));
    return null;
  });
}

export async function deleteSourceAction(id: string): Promise<ActionResult<void>> {
  return run((repo, userId) => repo.deleteUpload(userId, parse(idSchema, id)));
}

function imagePart(form: FormData, name: string): File | null {
  const part = form.get(name);
  if (part === null) return null;
  if (!(part instanceof File) || part.size === 0 || part.size > SCAN_LIMITS.maxCropBytes || !(IMAGE_MIME_TYPES as readonly string[]).includes(part.type)) throw new InvalidRequest();
  return part;
}

/** `meta` (JSON) + optional `originalCrop` / `diagramImage` image parts. Saving a problem never needs an AI key. */
export async function createProblemAction(form: FormData): Promise<ActionResult<MistakeCard>> {
  return run((repo, userId) => {
    const raw = form.get("meta");
    let json: unknown;
    try {
      json = JSON.parse(typeof raw === "string" ? raw : "");
    } catch {
      throw new InvalidRequest();
    }
    return repo.createCard(userId, { ...parse(newProblemMetaSchema, json), originalCrop: imagePart(form, "originalCrop"), diagramImage: imagePart(form, "diagramImage") });
  });
}

export async function deleteProblemAction(id: string): Promise<ActionResult<void>> {
  return run((repo, userId) => repo.deleteCard(userId, parse(idSchema, id)));
}

export async function updateCardAction(id: string, patch: CardPatch): Promise<ActionResult<MistakeCard>> {
  return run((repo, userId) => repo.updateCard(userId, parse(idSchema, id), parse(cardPatchSchema, patch)));
}

export async function setCardTagsAction(cardId: string, tagIds: string[]): Promise<ActionResult<void>> {
  return run((repo, userId) => repo.setCardTags(userId, parse(idSchema, cardId), parse(tagIdsSchema, tagIds)));
}

// ── Review ───────────────────────────────────────────────────────────────────────────────────────────────────────

const CLOCK_TOLERANCE_MS = 5 * 60_000;

export async function reviewCardAction(input: ReviewInput): Promise<ActionResult<{ card: MistakeCard; log: CardAttemptLog }>> {
  return run((repo, userId) => {
    const review = parse(reviewInputSchema, input);
    // The schedule is computed from the review time: accept the browser's clock only when it agrees with the server's.
    const now = new Date();
    const reviewedAt = Math.abs(review.reviewedAt.getTime() - now.getTime()) <= CLOCK_TOLERANCE_MS ? review.reviewedAt : now;
    return repo.reviewCard(userId, { ...review, reviewedAt });
  });
}

// ── AI memory & tags ─────────────────────────────────────────────────────────────────────────────────────────────

export async function saveSubjectMemoryAction(subjectId: string, input: SubjectMemoryInput): Promise<ActionResult<null>> {
  return run(async (repo, userId) => {
    await repo.saveSubjectMemory(userId, parse(idSchema, subjectId), parse(subjectMemorySchema, input));
    return null;
  });
}

export async function updatePersonaAction(patch: PersonaPatch): Promise<ActionResult<null>> {
  return run(async (repo, userId) => {
    await repo.updatePersona(userId, parse(personaPatchSchema, patch));
    return null;
  });
}

/** Persist one "Update memory" result: subject memory, learner persona and any tag suggestions. */
export async function applyMemorySyncAction(
  subjectId: string,
  result: MemorySyncResponse,
  meta: { sourceCardCount: number; sourceAttemptCount: number; suggestionMeta: Pick<NewTagSuggestion, "aiProvider" | "aiModel" | "outputLanguage"> },
): Promise<ActionResult<TagSuggestionFeedback[]>> {
  return run(async (repo, userId) => {
    const id = parse(idSchema, subjectId);
    const input = parse(memorySyncApplySchema, { result, meta });
    await repo.saveSubjectMemory(userId, id, { memorySummary: input.result.summary, memoryInsights: input.result.insights, source: "sync", memorySourceCardCount: input.meta.sourceCardCount });
    await repo.updatePersona(userId, { ...input.result.persona, synced: true, lastSyncModel: input.result.model, sourceAttemptCount: input.meta.sourceAttemptCount });
    if (input.result.tagSuggestions.length === 0) return [];
    return repo.addTagSuggestions(userId, id, input.result.tagSuggestions.map((s) => ({ ...s, ...input.meta.suggestionMeta })));
  });
}

export async function addTagSuggestionsAction(subjectId: string, suggestions: NewTagSuggestion[]): Promise<ActionResult<TagSuggestionFeedback[]>> {
  return run((repo, userId) => repo.addTagSuggestions(userId, parse(idSchema, subjectId), parse(newTagSuggestionsSchema, suggestions)));
}

export async function acceptTagSuggestionAction(id: string): Promise<ActionResult<AdaptiveTag>> {
  return run((repo, userId) => repo.acceptTagSuggestion(userId, parse(idSchema, id)));
}

export async function rejectTagSuggestionAction(id: string, reason: TagDeclineReason, detail?: string | null): Promise<ActionResult<void>> {
  return run((repo, userId) => {
    const decline = parse(declineSchema, { reason, detail });
    return repo.rejectTagSuggestion(userId, parse(idSchema, id), decline.reason, decline.detail);
  });
}

// ── Exam scopes & generated problems ─────────────────────────────────────────────────────────────────────────────

export async function createExamPrepSessionAction(input: NewExamPrepSession): Promise<ActionResult<ExamPrepSession>> {
  return run((repo, userId) => repo.createExamPrepSession(userId, parse(newExamPrepSchema, input)));
}

export async function deleteExamPrepSessionAction(id: string): Promise<ActionResult<void>> {
  return run((repo, userId) => repo.deleteExamPrepSession(userId, parse(idSchema, id)));
}

export async function saveSynthesizedProblemAction(input: NewSynthesizedProblem): Promise<ActionResult<AiSynthesizedProblem>> {
  return run((repo, userId) => repo.saveSynthesizedProblem(userId, parse(newSynthesizedProblemSchema, input)));
}

export async function updateSynthesizedProblemAction(id: string, patch: SynthesizedProblemPatch): Promise<ActionResult<AiSynthesizedProblem>> {
  return run((repo, userId) => repo.updateSynthesizedProblem(userId, parse(idSchema, id), parse(synthesizedProblemPatchSchema, patch)));
}

export async function promoteSynthesizedProblemAction(id: string): Promise<ActionResult<MistakeCard>> {
  return run((repo, userId) => repo.promoteSynthesizedProblem(userId, parse(idSchema, id)));
}

export async function deleteSynthesizedProblemAction(id: string): Promise<ActionResult<void>> {
  return run((repo, userId) => repo.deleteSynthesizedProblem(userId, parse(idSchema, id)));
}
