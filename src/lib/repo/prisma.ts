import "server-only";

/**
 * PostgreSQL repository. DATA ISOLATION RULE: every query below carries the caller's `userId` in its `where`
 * (directly, or through an owning relation for the two link tables that have no `user_id` column). Callers obtain
 * that id from the verified session (`requireUserId()` in src/server/session.ts) — never from request input.
 */
import { randomUUID } from "node:crypto";

import {
  Prisma, type CardAttemptLog as DbAttemptLog, type ExamUpload as DbUpload, type MistakeCard as DbCard, type Subject as DbSubject, type UserAiPersona as DbPersona,
} from "@/generated/prisma/client";
import { normalizeInsights } from "@/lib/brain";
import { BASE_TAGS, MAX_PENDING_TAG_SUGGESTIONS, SUBJECT_COLORS, tagScopeKey, type TagDeclineReason } from "@/lib/constants";
import { encryptApiKey } from "@/lib/crypto";
import type { Db } from "@/lib/db/prisma";
import { problemSaveIssue, uploadThumbnailPath } from "@/lib/problems";
import {
  RepoError, type AdaptiveTag, type AiSynthesizedProblem, type ApiKeyCredential, type ApiKeyPatch, type CardAttemptLog, type CardPatch, type CropBox,
  type ExamPrepSession, type ExamUpload, type MistakeCard, type NewApiKey, type NewExamPrepSession, type NewExamUpload, type NewProblem, type NewSubject,
  type NewSynthesizedProblem, type NewTagSuggestion, type PersonaPatch, type PersonaPreferences, type Repository, type ReviewInput, type StoredBlob, type Subject,
  type SubjectMemoryInput, type SubjectMemoryInsights, type SubjectPatch, type SynthesizedProblemPatch, type TagSuggestionFeedback, type Topic, type UploadPatch,
  type User, type UserAiPersona, type UserApiKey, type UserPatch, type UserSnapshot,
} from "@/lib/repo/types";
import { cleanNote, scheduleReview } from "@/lib/review";
import { formatDeclineReason, rememberTagFeedback, sameTagName, tagsForSubject, uniqueSlug } from "@/lib/tags";

// ── Column sets: what may leave the database ─────────────────────────────────────────────────────────────────────
// `passwordHash` and the encrypted API key are never selected into anything returned to a caller.

const USER_SELECT = {
  id: true, email: true, displayName: true, role: true, uiLanguage: true, defaultAiOutputLanguage: true, theme: true, timezone: true, desiredRetention: true,
  onboardedAt: true, lastActiveAt: true, createdAt: true, updatedAt: true,
} satisfies Prisma.UserSelect;

const API_KEY_SELECT = {
  id: true, userId: true, provider: true, label: true, keyHint: true, baseUrl: true, defaultModel: true, visionModel: true, aiOutputLanguage: true, isDefault: true,
  isActive: true, lastUsedAt: true, lastValidatedAt: true, lastErrorMessage: true, createdAt: true, updatedAt: true,
} satisfies Prisma.UserApiKeySelect;

const jsonOrNull = (value: unknown) => (value == null ? Prisma.DbNull : (value as Prisma.InputJsonValue));

const toSubject = (row: DbSubject): Subject => ({ ...row, memoryInsights: row.memoryInsights as unknown as SubjectMemoryInsights | null });
const toCard = (row: DbCard): MistakeCard => ({ ...row, cropBox: row.cropBox as unknown as CropBox | null, figureBox: row.figureBox as unknown as CropBox | null });
const toPersona = (row: DbPersona): UserAiPersona => ({
  ...row,
  learningHabits: row.learningHabits as Record<string, unknown> | null,
  preferences: row.preferences as unknown as PersonaPreferences | null,
});
function toUpload(row: DbUpload): ExamUpload {
  const { id, userId, subjectId, title, sourceLabel, fileKind, mimeType, storageBucket, storagePath, pageStoragePaths, fileSizeBytes, pageCount, sha256, createdAt, updatedAt } = row;
  return { id, userId, subjectId, title, sourceLabel, fileKind, mimeType, storageBucket, storagePath, pageStoragePaths, fileSizeBytes, pageCount, sha256, createdAt, updatedAt };
}
function toLog(row: DbAttemptLog): CardAttemptLog {
  const { userAnswerLatex: _unused, ...log } = row;
  void _unused;
  return log;
}

// ── Guards ───────────────────────────────────────────────────────────────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ids are UUID columns; anything else cannot exist (and would make Postgres raise instead of returning no row). */
const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const uuids = (values: readonly string[] | undefined) => [...new Set(values ?? [])].filter(isUuid);

const notFound = (what: string) => new RepoError("NOT_FOUND", `${what} not found`);

/** Run a write whose `where` includes `userId`; "no such row for this user" becomes a NOT_FOUND RepoError. */
async function owned<T>(what: string, id: string, run: () => Promise<T>): Promise<T> {
  if (!isUuid(id)) throw notFound(what);
  try {
    return await run();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") throw notFound(what);
    throw err;
  }
}

const trimOrNull = (value: string | null | undefined) => value?.trim() || null;

async function bytesOf(blob: Blob): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** Every name a tag answers to (a base tag keeps its translations until renamed). */
function tagNames(tag: Pick<AdaptiveTag, "name" | "i18nKey">): string[] {
  const base = tag.i18nKey ? BASE_TAGS.find((b) => b.i18nKey === tag.i18nKey) : undefined;
  return [tag.name, ...(base ? Object.values(base.name) : [])];
}

export class PrismaRepository implements Repository {
  constructor(private readonly db: Db) {}

  // ── Account ──────────────────────────────────────────────────────────────────────────────────────────────────

  async loadSnapshot(userId: string): Promise<UserSnapshot | null> {
    if (!isUuid(userId)) return null;
    const user = await this.db.user.findUnique({ where: { id: userId }, select: USER_SELECT });
    if (!user) return null;
    const where = { userId };
    const [subjects, topics, apiKeys, cards, logs, tags, cardTags, examUploads, persona, tagSuggestions, examPrepSessions, synthesizedProblems, synthesisSources] = await Promise.all([
      this.db.subject.findMany({ where, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
      this.db.topic.findMany({ where, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
      this.db.userApiKey.findMany({ where, select: API_KEY_SELECT, orderBy: { createdAt: "asc" } }),
      this.db.mistakeCard.findMany({ where }),
      this.db.cardAttemptLog.findMany({ where }),
      this.db.adaptiveTag.findMany({ where, orderBy: [{ createdAt: "asc" }, { name: "asc" }] }),
      // Link tables carry no user_id: scope them through the card / problem they belong to.
      this.db.mistakeCardTag.findMany({ where: { card: { userId } } }),
      this.db.examUpload.findMany({ where, orderBy: { createdAt: "desc" } }),
      this.db.userAiPersona.findUnique({ where: { userId } }),
      this.db.tagSuggestionFeedback.findMany({ where, orderBy: { createdAt: "desc" } }),
      this.db.examPrepSession.findMany({ where, orderBy: { createdAt: "asc" } }),
      this.db.aiSynthesizedProblem.findMany({ where, orderBy: { createdAt: "desc" } }),
      this.db.aiSynthesizedProblemSource.findMany({ where: { problem: { userId } }, orderBy: { position: "asc" } }),
    ]);
    const baseOrder = (tag: AdaptiveTag) => {
      const i = BASE_TAGS.findIndex((b) => b.slug === tag.slug);
      return tag.origin === "BASE" && i >= 0 ? i : BASE_TAGS.length;
    };
    return {
      user,
      subjects: subjects.map(toSubject),
      topics,
      apiKeys,
      cards: cards.map(toCard),
      logs: logs.map(toLog),
      tags: [...tags].sort((a, b) => baseOrder(a) - baseOrder(b)),
      cardTags,
      examUploads: examUploads.map(toUpload),
      persona: persona ? toPersona(persona) : null,
      tagSuggestions,
      examPrepSessions,
      synthesizedProblems,
      synthesisSources,
    };
  }

  async updateUser(userId: string, patch: UserPatch): Promise<User> {
    const { displayName, uiLanguage, defaultAiOutputLanguage, theme, timezone, desiredRetention, lastActiveAt } = patch;
    return owned("Account", userId, () =>
      this.db.user.update({
        where: { id: userId },
        data: { displayName: displayName === undefined ? undefined : trimOrNull(displayName), uiLanguage, defaultAiOutputLanguage, theme, timezone, desiredRetention, lastActiveAt },
        select: USER_SELECT,
      }),
    );
  }

  // ── Subjects & topics ────────────────────────────────────────────────────────────────────────────────────────

  private async assertKey(userId: string, keyId: string | null | undefined): Promise<void> {
    if (!keyId) return;
    if (!isUuid(keyId) || !(await this.db.userApiKey.findFirst({ where: { id: keyId, userId }, select: { id: true } }))) throw notFound("UserApiKey");
  }

  async createSubject(userId: string, input: NewSubject): Promise<Subject> {
    const name = input.name.trim();
    if (!name) throw new RepoError("EMPTY_NAME");
    await this.assertKey(userId, input.preferredApiKeyId);
    return this.db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { uiLanguage: true } });
      if (!user) throw notFound("Account");
      const existing = await tx.subject.findMany({ where: { userId }, select: { slug: true, sortOrder: true } });
      const subject = await tx.subject.create({
        data: {
          userId, name, slug: uniqueSlug(name, existing.map((s) => s.slug)), description: trimOrNull(input.description), color: input.color ?? null, icon: input.icon ?? null,
          aiOutputLanguage: input.aiOutputLanguage ?? null, preferredApiKeyId: input.preferredApiKeyId ?? null, examDate: input.examDate ?? null,
          sortOrder: existing.reduce((max, s) => Math.max(max, s.sortOrder + 1), 0),
        },
      });
      // Every subject starts with the four BASE error tags, in its own scope.
      await tx.adaptiveTag.createMany({
        data: BASE_TAGS.map((base) => ({
          userId, subjectId: subject.id, scopeKey: tagScopeKey(subject.id), name: base.name[user.uiLanguage], slug: base.slug, i18nKey: base.i18nKey, color: base.color, origin: "BASE" as const,
        })),
      });
      return toSubject(subject);
    });
  }

  async updateSubject(userId: string, id: string, patch: SubjectPatch): Promise<Subject> {
    await this.assertKey(userId, patch.preferredApiKeyId);
    const { name, description, color, icon, aiOutputLanguage, examDate, preferredApiKeyId, archivedAt } = patch;
    if (name !== undefined && !name.trim()) throw new RepoError("EMPTY_NAME");
    const row = await owned("Subject", id, () =>
      this.db.subject.update({
        where: { id, userId },
        data: { name: name?.trim(), description: description === undefined ? undefined : trimOrNull(description), color, icon, aiOutputLanguage, examDate, preferredApiKeyId, archivedAt },
      }),
    );
    return toSubject(row);
  }

  async deleteSubject(userId: string, id: string): Promise<void> {
    await owned("Subject", id, () =>
      this.db.$transaction(async (tx) => {
        const cards = await tx.mistakeCard.findMany({ where: { userId, subjectId: id }, select: { diagramImagePath: true, originalCropPath: true } });
        // Cascades: topics, cards (+ logs, tag links, synthesis links), tags, suggestions, exam scopes, generated problems.
        await tx.subject.delete({ where: { id, userId } });
        const paths = cards.flatMap((c) => [c.diagramImagePath, c.originalCropPath]).filter((p): p is string => Boolean(p));
        if (paths.length > 0) await tx.storedFile.deleteMany({ where: { userId, path: { in: paths } } });
      }),
    );
  }

  async createTopic(userId: string, input: { subjectId: string; name: string; parentId?: string | null }): Promise<Topic> {
    const name = input.name.trim();
    if (!name) throw new RepoError("EMPTY_NAME");
    if (!isUuid(input.subjectId)) throw notFound("Subject");
    const parentId = input.parentId ?? null;
    if (parentId !== null && !isUuid(parentId)) throw notFound("Topic");
    return this.db.$transaction(async (tx) => {
      if (!(await tx.subject.findFirst({ where: { id: input.subjectId, userId }, select: { id: true } }))) throw notFound("Subject");
      const all = await tx.topic.findMany({ where: { userId, subjectId: input.subjectId }, select: { id: true, slug: true, parentId: true, sortOrder: true } });
      if (parentId) {
        const parent = all.find((t) => t.id === parentId);
        if (!parent) throw notFound("Topic");
        if (parent.parentId !== null) throw new RepoError("TOPIC_DEPTH", "Topics nest only one level deep");
      }
      const siblings = all.filter((t) => t.parentId === parentId);
      return tx.topic.create({
        data: { userId, subjectId: input.subjectId, parentId, name, slug: uniqueSlug(name, all.map((t) => t.slug)), sortOrder: siblings.reduce((max, t) => Math.max(max, t.sortOrder + 1), 0) },
      });
    });
  }

  async updateTopic(userId: string, id: string, patch: { name?: string; sortOrder?: number }): Promise<Topic> {
    if (patch.name !== undefined && !patch.name.trim()) throw new RepoError("EMPTY_NAME");
    return owned("Topic", id, () => this.db.topic.update({ where: { id, userId }, data: { name: patch.name?.trim(), sortOrder: patch.sortOrder } }));
  }

  async deleteTopic(userId: string, id: string): Promise<void> {
    await owned("Topic", id, () =>
      this.db.$transaction(async (tx) => {
        const children = await tx.topic.findMany({ where: { userId, parentId: id }, select: { id: true } });
        const doomed = [id, ...children.map((c) => c.id)];
        // Saved exam scopes keep topic ids in an array column, which no foreign key cleans up.
        const scopes = await tx.examPrepSession.findMany({ where: { userId, topicIds: { hasSome: doomed } }, select: { id: true, topicIds: true } });
        for (const scope of scopes) {
          await tx.examPrepSession.update({ where: { id: scope.id, userId }, data: { topicIds: scope.topicIds.filter((t) => !doomed.includes(t)) } });
        }
        // Child topics cascade; cards and generated problems keep existing with topicId = null (ON DELETE SET NULL).
        await tx.topic.delete({ where: { id, userId } });
      }),
    );
  }

  // ── API keys ─────────────────────────────────────────────────────────────────────────────────────────────────

  async createApiKey(userId: string, input: NewApiKey): Promise<UserApiKey> {
    const label = input.label.trim();
    const existing = await this.db.userApiKey.findMany({ where: { userId }, select: { label: true } });
    if (!label || existing.some((k) => k.label.toLowerCase() === label.toLowerCase())) throw new RepoError("DUPLICATE_LABEL");
    // AAD binds the ciphertext to this user and provider, so it cannot be replayed on another account.
    const { encryptedKey, encryptionKeyId, keyHint } = encryptApiKey(input.apiKey, userId, input.provider);
    const isDefault = input.isDefault === true || existing.length === 0;
    try {
      return await this.db.$transaction(async (tx) => {
        if (isDefault) await tx.userApiKey.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
        return tx.userApiKey.create({
          data: {
            userId, provider: input.provider, label, encryptedKey, encryptionKeyId, keyHint, baseUrl: trimOrNull(input.baseUrl), defaultModel: trimOrNull(input.defaultModel),
            visionModel: trimOrNull(input.visionModel), aiOutputLanguage: input.aiOutputLanguage ?? null, isDefault,
          },
          select: API_KEY_SELECT,
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") throw new RepoError("DUPLICATE_LABEL");
      throw err;
    }
  }

  async updateApiKey(userId: string, id: string, patch: ApiKeyPatch): Promise<UserApiKey> {
    const { label, baseUrl, defaultModel, visionModel, aiOutputLanguage, isDefault, isActive, lastUsedAt, lastValidatedAt, lastErrorMessage } = patch;
    return owned("UserApiKey", id, () =>
      this.db.$transaction(async (tx) => {
        if (isDefault) await tx.userApiKey.updateMany({ where: { userId, isDefault: true, id: { not: id } }, data: { isDefault: false } });
        return tx.userApiKey.update({
          where: { id, userId },
          data: { label: label?.trim() || undefined, baseUrl, defaultModel, visionModel, aiOutputLanguage, isDefault, isActive, lastUsedAt, lastValidatedAt, lastErrorMessage },
          select: API_KEY_SELECT,
        });
      }),
    );
  }

  async deleteApiKey(userId: string, id: string): Promise<void> {
    // Subjects and generated problems that referenced the key fall back to null (ON DELETE SET NULL).
    await owned("UserApiKey", id, () => this.db.userApiKey.delete({ where: { id, userId }, select: { id: true } }));
  }

  async getApiKeyCredential(userId: string, id: string): Promise<ApiKeyCredential | null> {
    if (!isUuid(id)) return null;
    return this.db.userApiKey.findFirst({
      where: { id, userId, isActive: true },
      select: { userId: true, provider: true, encryptedKey: true, baseUrl: true, defaultModel: true, visionModel: true },
    });
  }

  // ── Sources & problems ───────────────────────────────────────────────────────────────────────────────────────

  async createUpload(userId: string, input: NewExamUpload): Promise<ExamUpload> {
    const existing = await this.db.examUpload.findUnique({ where: { userId_sha256: { userId, sha256: input.sha256 } } });
    if (existing) return toUpload(existing);
    const subjectId = input.subjectId ?? null;
    if (subjectId && (!isUuid(subjectId) || !(await this.db.subject.findFirst({ where: { id: subjectId, userId }, select: { id: true } })))) throw notFound("Subject");
    const { files: blobs, fileKind } = input;
    if (blobs.length === 0 || (fileKind === "PDF" && blobs.length !== 1)) throw new RepoError("INVALID_UPLOAD");

    const id = randomUUID();
    const base = uniqueSlug(input.title, []);
    const paths = blobs.map((blob, i) => {
      const ext = fileKind === "PDF" ? "pdf" : (blob.type.split("/")[1] ?? "jpg").replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
      return `u/${userId}/uploads/${id}/${base}${blobs.length > 1 ? `-p${i + 1}` : ""}.${ext}`;
    });
    const files = await Promise.all(
      blobs.map(async (blob, i) => ({ path: paths[i], userId, mimeType: blob.type || input.mimeType, sizeBytes: blob.size, data: await bytesOf(blob) })),
    );
    if (input.thumbnail) {
      files.push({ path: uploadThumbnailPath({ userId, id }), userId, mimeType: input.thumbnail.type || "image/jpeg", sizeBytes: input.thumbnail.size, data: await bytesOf(input.thumbnail) });
    }
    // One atomic batch (no interactive round trips while the file bytes are in flight).
    const [upload] = await this.db.$transaction([
      this.db.examUpload.create({
        data: {
          id, userId, subjectId, title: input.title.trim() || "untitled", sourceLabel: trimOrNull(input.sourceLabel), fileKind, mimeType: input.mimeType, storagePath: paths[0],
          pageStoragePaths: fileKind === "IMAGE" ? paths : [], fileSizeBytes: input.fileSizeBytes, pageCount: input.pageCount, sha256: input.sha256, status: "READY",
        },
      }),
      this.db.storedFile.createMany({ data: files }),
    ]);
    return toUpload(upload);
  }

  async updateUpload(userId: string, id: string, patch: UploadPatch): Promise<ExamUpload> {
    if (patch.subjectId && (!isUuid(patch.subjectId) || !(await this.db.subject.findFirst({ where: { id: patch.subjectId, userId }, select: { id: true } })))) throw notFound("Subject");
    const row = await owned("ExamUpload", id, () =>
      this.db.examUpload.update({
        where: { id, userId },
        data: { title: patch.title?.trim() || undefined, sourceLabel: patch.sourceLabel === undefined ? undefined : trimOrNull(patch.sourceLabel), subjectId: patch.subjectId },
      }),
    );
    return toUpload(row);
  }

  async deleteUpload(userId: string, id: string): Promise<void> {
    if (!isUuid(id)) throw notFound("ExamUpload");
    const upload = await this.db.examUpload.findFirst({ where: { id, userId } });
    if (!upload) throw notFound("ExamUpload");
    const paths = [...new Set([upload.storagePath, ...upload.pageStoragePaths, uploadThumbnailPath(upload)])];
    // Problems snipped from it stay in the vault with examUploadId = null (ON DELETE SET NULL).
    await this.db.$transaction([this.db.storedFile.deleteMany({ where: { userId, path: { in: paths } } }), this.db.examUpload.delete({ where: { id, userId } })]);
  }

  async createCard(userId: string, input: NewProblem): Promise<MistakeCard> {
    const { subjectId } = input;
    const topicId = input.topicId ?? null;
    const examUploadId = input.examUploadId ?? null;
    if (!isUuid(subjectId) || !(await this.db.subject.findFirst({ where: { id: subjectId, userId }, select: { id: true } }))) throw notFound("Subject");
    if (topicId && (!isUuid(topicId) || !(await this.db.topic.findFirst({ where: { id: topicId, userId, subjectId }, select: { id: true } })))) throw notFound("Topic");
    if (examUploadId && (!isUuid(examUploadId) || !(await this.db.examUpload.findFirst({ where: { id: examUploadId, userId }, select: { id: true } })))) throw notFound("ExamUpload");
    if (problemSaveIssue({ questionLatex: input.questionLatex, hasImage: Boolean(input.originalCrop), subjectId })) throw new RepoError("EMPTY_QUESTION");

    const allowed = new Set(tagsForSubject(await this.db.adaptiveTag.findMany({ where: { userId } }), subjectId).map((tag) => tag.id));
    const tagIds = [...new Set(input.tagIds ?? [])];
    if (tagIds.some((tagId) => !allowed.has(tagId))) throw new RepoError("TAG_NOT_FOUND", "Tag not found");

    const id = randomUUID();
    const base = `u/${userId}/cards/${id}`;
    const originalCropPath = input.originalCrop ? `${base}/original.jpg` : null;
    const diagramImagePath = input.diagramImage ? `${base}/diagram.png` : null;
    const files: Prisma.StoredFileCreateManyInput[] = [];
    if (input.originalCrop && originalCropPath) files.push({ path: originalCropPath, userId, mimeType: input.originalCrop.type || "image/jpeg", sizeBytes: input.originalCrop.size, data: await bytesOf(input.originalCrop) });
    if (input.diagramImage && diagramImagePath) files.push({ path: diagramImagePath, userId, mimeType: input.diagramImage.type || "image/png", sizeBytes: input.diagramImage.size, data: await bytesOf(input.diagramImage) });

    const card = await this.db.$transaction(async (tx) => {
      const created = await tx.mistakeCard.create({
        data: {
          id, userId, subjectId, topicId, examUploadId, title: trimOrNull(input.title), questionLatex: input.questionLatex.trim(), solutionLatex: trimOrNull(input.solutionLatex),
          sourcePage: input.sourcePage ?? null, cropBox: jsonOrNull(input.cropBox), figureBox: jsonOrNull(input.figureBox), diagramImagePath, originalCropPath,
          ocrStatus: input.ocrStatus ?? "MANUAL", ocrModel: input.ocrModel ?? null, ocrConfidence: input.ocrConfidence ?? null, ocrRawText: input.ocrRawText ?? null,
          ahaNote: trimOrNull(input.ahaNote), isHighYield: input.isHighYield ?? false, highYieldNote: trimOrNull(input.highYieldNote),
        },
      });
      if (files.length > 0) await tx.storedFile.createMany({ data: files });
      if (tagIds.length > 0) {
        await tx.mistakeCardTag.createMany({ data: tagIds.map((tagId) => ({ cardId: id, tagId, assignedBy: "USER" as const })) });
        await tx.adaptiveTag.updateMany({ where: { userId, id: { in: tagIds } }, data: { usageCount: { increment: 1 } } });
      }
      await tx.subject.update({ where: { id: subjectId, userId }, data: { memoryStale: true } });
      return created;
    });
    return toCard(card);
  }

  async deleteCard(userId: string, id: string): Promise<void> {
    await owned("MistakeCard", id, () =>
      this.db.$transaction(async (tx) => {
        const card = await tx.mistakeCard.findFirst({ where: { id, userId }, select: { subjectId: true, diagramImagePath: true, originalCropPath: true, tags: { select: { tagId: true } } } });
        if (!card) throw notFound("MistakeCard");
        const tagIds = card.tags.map((link) => link.tagId);
        if (tagIds.length > 0) await tx.adaptiveTag.updateMany({ where: { userId, id: { in: tagIds }, usageCount: { gt: 0 } }, data: { usageCount: { decrement: 1 } } });
        // Cascades: attempt logs, tag links, synthesis source links. A problem promoted from it keeps existing (SET NULL).
        await tx.mistakeCard.delete({ where: { id, userId } });
        const paths = [card.diagramImagePath, card.originalCropPath].filter((p): p is string => Boolean(p));
        if (paths.length > 0) await tx.storedFile.deleteMany({ where: { userId, path: { in: paths } } });
        await tx.subject.update({ where: { id: card.subjectId, userId }, data: { memoryStale: true } });
      }),
    );
  }

  async getBlob(userId: string, path: string): Promise<StoredBlob | null> {
    return this.db.storedFile.findFirst({ where: { path, userId }, select: { data: true, mimeType: true } });
  }

  // ── Review ───────────────────────────────────────────────────────────────────────────────────────────────────

  async reviewCard(userId: string, input: ReviewInput): Promise<{ card: MistakeCard; log: CardAttemptLog }> {
    if (!isUuid(input.cardId)) throw notFound("MistakeCard");
    return this.db.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { desiredRetention: true, timezone: true } });
      const row = await tx.mistakeCard.findFirst({ where: { id: input.cardId, userId } });
      if (!user || !row) throw notFound("MistakeCard");
      const card = toCard(row);
      const { card: scheduled, log: fsrs } = scheduleReview(card, input.rating, input.reviewedAt, user);
      // Read and bumped inside this transaction; the (cardId, attemptNumber) unique index rejects a concurrent duplicate.
      const attemptNumber = card.attemptCount + 1;
      const log = await tx.cardAttemptLog.create({
        data: {
          userId, cardId: card.id, attemptNumber, note: cleanNote(input.note),
          timeSpentMs: input.timeSpentMs != null && Number.isFinite(input.timeSpentMs) ? Math.min(2_000_000_000, Math.max(0, Math.round(input.timeSpentMs))) : null,
          variantQuestionLatex: trimOrNull(input.variantQuestionLatex), ...fsrs, elapsedDays: Math.round(fsrs.elapsedDays), scheduledDays: Math.round(fsrs.scheduledDays),
        },
      });
      const next = await tx.mistakeCard.update({
        where: { id: card.id, userId },
        data: { ...scheduled, elapsedDays: Math.round(scheduled.elapsedDays), scheduledDays: Math.round(scheduled.scheduledDays), attemptCount: attemptNumber },
      });
      await tx.subject.updateMany({ where: { id: card.subjectId, userId, memoryStale: false }, data: { memoryStale: true } });
      return { card: toCard(next), log: toLog(log) };
    });
  }

  async updateCard(userId: string, id: string, patch: CardPatch): Promise<MistakeCard> {
    if (!isUuid(id)) throw notFound("MistakeCard");
    const card = await this.db.mistakeCard.findFirst({ where: { id, userId }, select: { subjectId: true, questionLatex: true, originalCropPath: true } });
    if (!card) throw notFound("MistakeCard");
    if (patch.topicId && (!isUuid(patch.topicId) || !(await this.db.topic.findFirst({ where: { id: patch.topicId, userId, subjectId: card.subjectId }, select: { id: true } })))) throw notFound("Topic");
    const questionLatex = patch.questionLatex?.trim();
    if (!(questionLatex ?? card.questionLatex) && !card.originalCropPath) throw new RepoError("EMPTY_QUESTION");
    const text = (value: string | null | undefined) => (value === undefined ? undefined : trimOrNull(value));
    const [next] = await this.db.$transaction([
      this.db.mistakeCard.update({
        where: { id, userId },
        data: {
          title: text(patch.title), questionLatex, solutionLatex: text(patch.solutionLatex), ahaNote: text(patch.ahaNote), highYieldNote: text(patch.highYieldNote), isHighYield: patch.isHighYield,
          topicId: patch.topicId, isSuspended: patch.isSuspended, ocrStatus: patch.ocrStatus, ocrModel: patch.ocrModel, ocrConfidence: patch.ocrConfidence, ocrRawText: patch.ocrRawText,
        },
      }),
      this.db.subject.update({ where: { id: card.subjectId, userId }, data: { memoryStale: true }, select: { id: true } }),
    ]);
    return toCard(next);
  }

  async setCardTags(userId: string, cardId: string, tagIds: string[]): Promise<void> {
    if (!isUuid(cardId)) throw notFound("MistakeCard");
    await this.db.$transaction(async (tx) => {
      const card = await tx.mistakeCard.findFirst({ where: { id: cardId, userId }, select: { subjectId: true, tags: { select: { tagId: true } } } });
      if (!card) throw notFound("MistakeCard");
      const allowed = new Set(tagsForSubject(await tx.adaptiveTag.findMany({ where: { userId } }), card.subjectId).map((tag) => tag.id));
      const wanted = new Set(tagIds);
      for (const tagId of wanted) if (!allowed.has(tagId)) throw new RepoError("TAG_NOT_FOUND", "Tag not found");
      const current = new Set(card.tags.map((link) => link.tagId));
      const removed = [...current].filter((tagId) => !wanted.has(tagId));
      const added = [...wanted].filter((tagId) => !current.has(tagId));
      if (removed.length > 0) {
        await tx.mistakeCardTag.deleteMany({ where: { cardId, tagId: { in: removed }, card: { userId } } });
        await tx.adaptiveTag.updateMany({ where: { userId, id: { in: removed }, usageCount: { gt: 0 } }, data: { usageCount: { decrement: 1 } } });
      }
      if (added.length > 0) {
        await tx.mistakeCardTag.createMany({ data: added.map((tagId) => ({ cardId, tagId, assignedBy: "USER" as const })) });
        await tx.adaptiveTag.updateMany({ where: { userId, id: { in: added } }, data: { usageCount: { increment: 1 } } });
      }
      await tx.subject.update({ where: { id: card.subjectId, userId }, data: { memoryStale: true } });
    });
  }

  // ── AI memory ────────────────────────────────────────────────────────────────────────────────────────────────

  async saveSubjectMemory(userId: string, subjectId: string, input: SubjectMemoryInput): Promise<Subject> {
    const summary = input.memorySummary.replace(/\r\n?/g, "\n").trim().slice(0, 4000);
    const row = await owned("Subject", subjectId, () =>
      this.db.subject.update({
        where: { id: subjectId, userId },
        data: {
          memorySummary: summary || null,
          memoryInsights: jsonOrNull(input.memoryInsights ? normalizeInsights(input.memoryInsights) : null),
          memoryVersion: { increment: 1 },
          memoryUpdatedAt: new Date(),
          ...(input.source === "sync" ? { memoryStale: false, memorySourceCardCount: input.memorySourceCardCount } : {}),
        },
      }),
    );
    return toSubject(row);
  }

  async updatePersona(userId: string, patch: PersonaPatch): Promise<UserAiPersona> {
    const { synced, ...fields } = patch;
    const list = (items: string[] | undefined) => items?.map((s) => s.trim()).filter(Boolean).slice(0, 8);
    const row = await this.db.$transaction(async (tx) => {
      const current = await tx.userAiPersona.findUnique({ where: { userId } });
      const data = {
        summary: fields.summary?.trim().slice(0, 2400),
        strengths: list(fields.strengths),
        weaknesses: list(fields.weaknesses),
        learningHabits: fields.learningHabits === undefined ? undefined : jsonOrNull(fields.learningHabits),
        lastSyncModel: fields.lastSyncModel,
        sourceAttemptCount: fields.sourceAttemptCount,
        ...(synced ? { version: (current?.version ?? 0) + 1, lastSyncedAt: new Date(), isStale: false } : {}),
      };
      return tx.userAiPersona.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    });
    return toPersona(row);
  }

  // ── Adaptive tags ────────────────────────────────────────────────────────────────────────────────────────────

  async addTagSuggestions(userId: string, subjectId: string, suggestions: NewTagSuggestion[]): Promise<TagSuggestionFeedback[]> {
    if (!isUuid(subjectId)) throw notFound("Subject");
    return this.db.$transaction(async (tx) => {
      if (!(await tx.subject.findFirst({ where: { id: subjectId, userId }, select: { id: true } }))) throw notFound("Subject");
      const live = tagsForSubject(await tx.adaptiveTag.findMany({ where: { userId } }), subjectId);
      const existing = await tx.tagSuggestionFeedback.findMany({ where: { userId, subjectId } });
      const subjectCards = new Set((await tx.mistakeCard.findMany({ where: { userId, subjectId }, select: { id: true } })).map((c) => c.id));
      // Strictly after every stored suggestion, so "newest first" stays well defined when calls land in the same millisecond.
      const now = new Date(Math.max(Date.now(), ...existing.map((e) => e.createdAt.getTime() + 1)));
      const created: TagSuggestionFeedback[] = [];
      for (const s of suggestions) {
        const name = s.proposedName.replace(/\s+/g, " ").trim().slice(0, 60);
        if (!name || !s.rationale.trim()) continue;
        if (live.some((tag) => tagNames(tag).some((n) => sameTagName(n, name)))) continue;
        if ([...existing, ...created].some((e) => e.proposedName && sameTagName(e.proposedName, name))) continue;
        const target = s.kind === "RENAME" ? live.find((tag) => tag.id === s.targetTagId) : undefined;
        if (s.kind === "RENAME" && (!target || existing.some((e) => e.status === "PENDING" && e.targetTagId === target.id))) continue;
        created.push(
          await tx.tagSuggestionFeedback.create({
            data: {
              userId, subjectId, kind: s.kind, targetTagId: target?.id ?? null, proposedName: name, proposedDescription: s.proposedDescription?.trim().slice(0, 300) || null,
              rationale: s.rationale.trim().slice(0, 600), evidenceCardIds: [...new Set(s.evidenceCardIds)].filter((id) => subjectCards.has(id)).slice(0, 12),
              aiProvider: s.aiProvider, aiModel: s.aiModel, outputLanguage: s.outputLanguage, createdAt: new Date(now.getTime() + created.length),
            },
          }),
        );
      }
      // Keep the banner short: only the newest few stay pending.
      const pending = [...existing.filter((e) => e.status === "PENDING"), ...created].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const stale = pending.slice(MAX_PENDING_TAG_SUGGESTIONS).map((s) => s.id);
      if (stale.length > 0) await tx.tagSuggestionFeedback.updateMany({ where: { userId, id: { in: stale } }, data: { status: "EXPIRED", resolvedAt: now } });
      return created.filter((s) => !stale.includes(s.id));
    });
  }

  async acceptTagSuggestion(userId: string, id: string): Promise<AdaptiveTag> {
    if (!isUuid(id)) throw notFound("TagSuggestionFeedback");
    return this.db.$transaction(async (tx) => {
      const suggestion = await tx.tagSuggestionFeedback.findFirst({ where: { id, userId } });
      if (!suggestion) throw notFound("TagSuggestionFeedback");
      if (suggestion.status !== "PENDING") throw new RepoError("SUGGESTION_RESOLVED");
      if (!suggestion.subjectId || !suggestion.proposedName) throw new RepoError("INVALID_SUGGESTION");
      const subjectId = suggestion.subjectId;
      const allTags = await tx.adaptiveTag.findMany({ where: { userId } });
      const live = tagsForSubject(allTags, subjectId);
      let result: AdaptiveTag;

      if (suggestion.kind === "CREATE") {
        const scopeKey = tagScopeKey(subjectId);
        const usedColors = new Set(live.map((t) => t.color));
        const evidence = (await tx.mistakeCard.findMany({ where: { userId, subjectId, id: { in: uuids(suggestion.evidenceCardIds) } }, select: { id: true } })).map((c) => c.id);
        result = await tx.adaptiveTag.create({
          data: {
            userId, subjectId, scopeKey, name: suggestion.proposedName, slug: uniqueSlug(suggestion.proposedName, allTags.filter((t) => t.scopeKey === scopeKey).map((t) => t.slug)),
            description: suggestion.proposedDescription, color: SUBJECT_COLORS.find((c) => !usedColors.has(c)) ?? SUBJECT_COLORS[live.length % SUBJECT_COLORS.length],
            origin: "AI_ACCEPTED", usageCount: evidence.length,
          },
        });
        // The cards whose notes motivated the tag get it right away (marked as AI-assigned).
        if (evidence.length > 0) await tx.mistakeCardTag.createMany({ data: evidence.map((cardId) => ({ cardId, tagId: result.id, assignedBy: "AI" as const })), skipDuplicates: true });
      } else if (suggestion.kind === "RENAME") {
        const target = live.find((t) => t.id === suggestion.targetTagId);
        if (!target) throw new RepoError("TAG_NOT_FOUND", "Tag not found");
        // Clearing i18nKey pins the new name (a base tag no longer follows the GUI language).
        result = await tx.adaptiveTag.update({
          where: { id: target.id, userId },
          data: { name: suggestion.proposedName, i18nKey: null, description: suggestion.proposedDescription ?? target.description },
        });
      } else {
        throw new RepoError("UNSUPPORTED_SUGGESTION");
      }

      await tx.tagSuggestionFeedback.update({ where: { id, userId }, data: { status: "ACCEPTED", resolvedAt: new Date(), resultingTagId: result.id } });
      await tx.subject.update({ where: { id: subjectId, userId }, data: { memoryStale: true } });
      return result;
    });
  }

  async rejectTagSuggestion(userId: string, id: string, reason: TagDeclineReason, detail?: string | null): Promise<void> {
    if (!isUuid(id)) throw notFound("TagSuggestionFeedback");
    await this.db.$transaction(async (tx) => {
      const suggestion = await tx.tagSuggestionFeedback.findFirst({ where: { id, userId } });
      if (!suggestion) throw notFound("TagSuggestionFeedback");
      if (suggestion.status !== "PENDING") throw new RepoError("SUGGESTION_RESOLVED");
      const now = new Date();
      await tx.tagSuggestionFeedback.update({ where: { id, userId }, data: { status: "REJECTED", rejectionReason: formatDeclineReason(reason, detail), resolvedAt: now } });
      // Feed the preference into the learner persona: future tag prompts read it from there.
      const persona = await tx.userAiPersona.findUnique({ where: { userId }, select: { preferences: true } });
      const entry = { at: now.toISOString(), subjectId: suggestion.subjectId, kind: suggestion.kind, proposedName: suggestion.proposedName, reason, detail: reason === "other" ? detail?.trim() || null : null };
      const preferences = rememberTagFeedback((persona?.preferences as unknown as PersonaPreferences | null) ?? null, entry) as unknown as Prisma.InputJsonValue;
      await tx.userAiPersona.upsert({ where: { userId }, create: { userId, preferences }, update: { preferences } });
    });
  }

  // ── Exam scopes & generated problems ─────────────────────────────────────────────────────────────────────────

  async createExamPrepSession(userId: string, input: NewExamPrepSession): Promise<ExamPrepSession> {
    const title = input.title.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!title) throw new RepoError("EMPTY_TITLE");
    if (!isUuid(input.subjectId) || !(await this.db.subject.findFirst({ where: { id: input.subjectId, userId }, select: { id: true } }))) throw notFound("Subject");
    const [topics, tags] = await Promise.all([
      this.db.topic.findMany({ where: { userId, subjectId: input.subjectId }, select: { id: true } }),
      this.db.adaptiveTag.findMany({ where: { userId } }),
    ]);
    const topicIds = new Set(topics.map((t) => t.id));
    const tagIds = new Set(tagsForSubject(tags, input.subjectId).map((t) => t.id));
    return this.db.examPrepSession.create({
      data: {
        userId, subjectId: input.subjectId, title, examDate: input.examDate ?? null, topicIds: [...new Set(input.topicIds ?? [])].filter((t) => topicIds.has(t)),
        tagIds: [...new Set(input.tagIds ?? [])].filter((t) => tagIds.has(t)), highYieldOnly: input.highYieldOnly ?? false, status: "ACTIVE",
      },
    });
  }

  async deleteExamPrepSession(userId: string, id: string): Promise<void> {
    // Problems generated under the scope keep existing with examPrepSessionId = null (ON DELETE SET NULL).
    await owned("ExamPrepSession", id, () => this.db.examPrepSession.delete({ where: { id, userId }, select: { id: true } }));
  }

  async saveSynthesizedProblem(userId: string, input: NewSynthesizedProblem): Promise<AiSynthesizedProblem> {
    const { subjectId } = input;
    if (!isUuid(subjectId) || !(await this.db.subject.findFirst({ where: { id: subjectId, userId }, select: { id: true } }))) throw notFound("Subject");
    const examPrepSessionId = input.examPrepSessionId ?? null;
    if (examPrepSessionId && (!isUuid(examPrepSessionId) || !(await this.db.examPrepSession.findFirst({ where: { id: examPrepSessionId, userId, subjectId }, select: { id: true } })))) throw notFound("ExamPrepSession");
    await this.assertKey(userId, input.apiKeyId);
    const topicId = input.topicId ?? null;
    if (topicId && (!isUuid(topicId) || !(await this.db.topic.findFirst({ where: { id: topicId, userId, subjectId }, select: { id: true } })))) throw notFound("Topic");

    const found = await this.db.mistakeCard.findMany({ where: { userId, subjectId, id: { in: uuids(input.sourceCardIds) } }, select: { id: true, topicId: true } });
    const sources = input.sourceCardIds.map((cardId) => found.find((c) => c.id === cardId));
    if (sources.some((c) => !c)) throw notFound("MistakeCard");
    const cards = sources as { id: string; topicId: string | null }[];
    if (cards.length === 0 || new Set(cards.map((c) => c.id)).size !== cards.length || (input.mode === "CLONE" && cards.length !== 1) || (input.mode === "MIX" && (cards.length < 2 || cards.length > 3))) {
      throw new RepoError("INVALID_SOURCES");
    }
    const sharedTopic = cards.every((c) => c.topicId === cards[0].topicId) ? cards[0].topicId : null;
    const id = randomUUID();
    const [problem] = await this.db.$transaction([
      this.db.aiSynthesizedProblem.create({
        data: {
          id, userId, subjectId, topicId: topicId ?? sharedTopic, examPrepSessionId, mode: input.mode, questionLatex: input.questionLatex.trim(), answerLatex: trimOrNull(input.answerLatex),
          solutionLatex: trimOrNull(input.solutionLatex), diagramDescription: trimOrNull(input.diagramDescription), difficultyEstimate: input.difficultyEstimate ?? null,
          verificationLatex: trimOrNull(input.verificationLatex), isExperimental: true, usedHighYield: input.usedHighYield, outputLanguage: input.outputLanguage, apiKeyId: input.apiKeyId ?? null,
          aiProvider: input.aiProvider, aiModel: input.aiModel, promptVersion: input.promptVersion,
        },
      }),
      this.db.aiSynthesizedProblemSource.createMany({ data: cards.map((card, position) => ({ problemId: id, cardId: card.id, position })) }),
    ]);
    return problem;
  }

  async updateSynthesizedProblem(userId: string, id: string, patch: SynthesizedProblemPatch): Promise<AiSynthesizedProblem> {
    const { revised, questionLatex, answerLatex, solutionLatex, verificationLatex, diagramDescription, difficultyEstimate, isFlaggedIncorrect, flagReason, userRating, aiModel } = patch;
    return owned("AiSynthesizedProblem", id, () =>
      this.db.aiSynthesizedProblem.update({
        where: { id, userId },
        // isExperimental can never be cleared: an AI problem stays "experimental" even after a fix.
        data: {
          questionLatex, answerLatex, solutionLatex, verificationLatex, diagramDescription, difficultyEstimate, isFlaggedIncorrect, flagReason, userRating, aiModel,
          isExperimental: true, revision: revised ? { increment: 1 } : undefined,
        },
      }),
    );
  }

  async promoteSynthesizedProblem(userId: string, id: string): Promise<MistakeCard> {
    if (!isUuid(id)) throw notFound("AiSynthesizedProblem");
    return this.db.$transaction(async (tx) => {
      const problem = await tx.aiSynthesizedProblem.findFirst({ where: { id, userId } });
      if (!problem) throw notFound("AiSynthesizedProblem");
      if (problem.promotedCardId) {
        const existing = await tx.mistakeCard.findFirst({ where: { id: problem.promotedCardId, userId } });
        if (existing) return toCard(existing);
      }
      const card = await tx.mistakeCard.create({
        data: {
          userId, subjectId: problem.subjectId, topicId: problem.topicId, questionLatex: problem.questionLatex, correctAnswerLatex: problem.answerLatex, solutionLatex: problem.solutionLatex,
          ocrStatus: "MANUAL", ocrModel: problem.aiModel,
        },
      });
      await tx.aiSynthesizedProblem.update({ where: { id, userId }, data: { promotedCardId: card.id } });
      await tx.subject.update({ where: { id: problem.subjectId, userId }, data: { memoryStale: true } });
      return toCard(card);
    });
  }

  async deleteSynthesizedProblem(userId: string, id: string): Promise<void> {
    await owned("AiSynthesizedProblem", id, () => this.db.aiSynthesizedProblem.delete({ where: { id, userId }, select: { id: true } }));
  }
}
