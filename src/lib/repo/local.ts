"use client";

/**
 * IndexedDB repository (local mode). Object stores mirror Prisma model names; every row carries `userId`
 * (the local account id) and every read goes through the `userId` index, so accounts never see each other's data.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import {
  BASE_TAGS, baseTagId, MAX_PENDING_TAG_SUGGESTIONS, RETIRED_BASE_TAG_SLUGS, slugify, SUBJECT_COLORS, tagScopeKey, type Language, type TagDeclineReason,
} from "@/lib/constants";
import { normalizeInsights } from "@/lib/brain";
import { buildDemoSeed } from "@/lib/repo/seed";
import { cleanNote, scheduleReview } from "@/lib/review";
import { formatDeclineReason, rememberTagFeedback, sameTagName, tagsForSubject, uniqueSlug } from "@/lib/tags";
import type {
  AdaptiveTag, AiSynthesizedProblem, AiSynthesizedProblemSource, ApiKeyPatch, CardAttemptLog, CardPatch, ExamPrepSession, ExamUpload, MistakeCard, MistakeCardTag, NewApiKey,
  NewExamPrepSession, NewExamUpload, NewScannedCard, NewSubject, NewSynthesizedProblem, NewTagSuggestion, PersonaPatch, Repository, ReviewInput, SaveScanResult, Subject,
  SubjectMemoryInput, SubjectPatch, SynthesizedProblemPatch, TagSuggestionFeedback, Topic, User, UserAiPersona, UserApiKey, UserPatch, UserSnapshot,
} from "@/lib/repo/types";

const DB_NAME = "vaultlearn";
const DB_VERSION = 4;
/**
 * Stores whose rows carry `userId` (and a `userId` index). `MistakeCardTag` and `AiSynthesizedProblemSource` have no
 * userId (like the Prisma models) and are reached through their card / problem.
 */
const USER_STORES = [
  "UserApiKey", "Subject", "Topic", "MistakeCard", "CardAttemptLog", "ExamUpload", "AdaptiveTag", "StoredFile", "UserAiPersona", "TagSuggestionFeedback",
  "ExamPrepSession", "AiSynthesizedProblem",
] as const;
type UserStore = (typeof USER_STORES)[number];

/** Local stand-in for Supabase Storage: exam files and card crops, addressed by `path`. */
export interface StoredFile {
  path: string;
  userId: string;
  mimeType: string;
  blob: Blob;
  createdAt: Date;
}

interface VaultDB extends DBSchema {
  User: { key: string; value: User };
  UserApiKey: { key: string; value: UserApiKey; indexes: { userId: string } };
  Subject: { key: string; value: Subject; indexes: { userId: string } };
  Topic: { key: string; value: Topic; indexes: { userId: string } };
  MistakeCard: { key: string; value: MistakeCard; indexes: { userId: string } };
  CardAttemptLog: { key: string; value: CardAttemptLog; indexes: { userId: string } };
  ExamUpload: { key: string; value: ExamUpload; indexes: { userId: string } };
  AdaptiveTag: { key: string; value: AdaptiveTag; indexes: { userId: string } };
  MistakeCardTag: { key: [string, string]; value: MistakeCardTag; indexes: { cardId: string } };
  StoredFile: { key: string; value: StoredFile; indexes: { userId: string } };
  UserAiPersona: { key: string; value: UserAiPersona; indexes: { userId: string } };
  TagSuggestionFeedback: { key: string; value: TagSuggestionFeedback; indexes: { userId: string } };
  ExamPrepSession: { key: string; value: ExamPrepSession; indexes: { userId: string } };
  AiSynthesizedProblem: { key: string; value: AiSynthesizedProblem; indexes: { userId: string } };
  AiSynthesizedProblemSource: { key: [string, string]; value: AiSynthesizedProblemSource; indexes: { problemId: string } };
  Meta: { key: string; value: { key: string; value: unknown } };
}

const uuid = () => crypto.randomUUID();

function baseTagRow(userId: string, subjectId: string, slug: string, language: Language, now: Date): AdaptiveTag {
  const base = BASE_TAGS.find((b) => b.slug === slug)!;
  return {
    id: baseTagId(subjectId, slug), userId, subjectId, scopeKey: tagScopeKey(subjectId), name: base.name[language], slug: base.slug, i18nKey: base.i18nKey,
    description: null, color: base.color, origin: "BASE", usageCount: 0, mergedIntoId: null, archivedAt: null, createdAt: now, updatedAt: now,
  };
}

function emptyPersona(userId: string, now: Date): UserAiPersona {
  return {
    id: `persona-${userId}`, userId, summary: "", strengths: [], weaknesses: [], learningHabits: null, preferences: null, version: 0, sourceAttemptCount: 0,
    isStale: true, lastSyncedAt: null, lastSyncModel: null, createdAt: now, updatedAt: now,
  };
}

/** Every name a tag answers to (a base tag keeps its translations until renamed). */
function tagNames(tag: AdaptiveTag): string[] {
  const base = tag.i18nKey ? BASE_TAGS.find((b) => b.i18nKey === tag.i18nKey) : undefined;
  return [tag.name, ...(base ? Object.values(base.name) : [])];
}

export class LocalRepository implements Repository {
  private dbPromise: Promise<IDBPDatabase<VaultDB>> | null = null;

  private db() {
    this.dbPromise ??= openDB<VaultDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (oldVersion < 1) {
          db.createObjectStore("User", { keyPath: "id" });
          for (const name of ["UserApiKey", "Subject", "Topic", "MistakeCard", "CardAttemptLog"] as const) {
            db.createObjectStore(name, { keyPath: "id" }).createIndex("userId", "userId");
          }
          db.createObjectStore("Meta", { keyPath: "key" });
        }
        if (oldVersion < 2) {
          // Phase 3 (exam scanner): uploads, tags, tag links, stored crops; scanner columns on existing cards.
          for (const name of ["ExamUpload", "AdaptiveTag"] as const) db.createObjectStore(name, { keyPath: "id" }).createIndex("userId", "userId");
          db.createObjectStore("StoredFile", { keyPath: "path" }).createIndex("userId", "userId");
          db.createObjectStore("MistakeCardTag", { keyPath: ["cardId", "tagId"] }).createIndex("cardId", "cardId");
          if (oldVersion >= 1) {
            const cards = tx.objectStore("MistakeCard");
            for (let cursor = await cards.openCursor(); cursor; cursor = await cursor.continue()) {
              const defaults: Partial<MistakeCard> = {
                examUploadId: null, sourcePage: null, cropBox: null, figureBox: null, diagramImagePath: null, originalCropPath: null,
                ocrStatus: "MANUAL", ocrModel: null, ocrConfidence: null, ocrRawText: null, ahaNote: null,
              };
              await cursor.update({ ...defaults, ...cursor.value });
            }
          }
        }
        if (oldVersion < 3) {
          // Multi-photo exams: IMAGE uploads gain `pageStoragePaths` (their single file is page 1).
          const uploads = tx.objectStore("ExamUpload");
          for (let cursor = await uploads.openCursor(); cursor; cursor = await cursor.continue()) {
            const row = cursor.value;
            if (!Array.isArray(row.pageStoragePaths)) await cursor.update({ ...row, pageStoragePaths: row.fileKind === "IMAGE" ? [row.storagePath] : [] });
          }
        }
        if (oldVersion < 4) {
          // Phase 4: Second Brain, tag suggestions, exam prep scopes, synthesized problems.
          for (const name of ["UserAiPersona", "TagSuggestionFeedback", "ExamPrepSession", "AiSynthesizedProblem"] as const) {
            db.createObjectStore(name, { keyPath: "id" }).createIndex("userId", "userId");
          }
          db.createObjectStore("AiSynthesizedProblemSource", { keyPath: ["problemId", "cardId"] }).createIndex("problemId", "problemId");
          if (oldVersion >= 1) {
            const subjects = tx.objectStore("Subject");
            for (let cursor = await subjects.openCursor(); cursor; cursor = await cursor.continue()) {
              await cursor.update({ ...cursor.value, memoryInsights: cursor.value.memoryInsights ?? null });
            }
            const logs = tx.objectStore("CardAttemptLog");
            for (let cursor = await logs.openCursor(); cursor; cursor = await cursor.continue()) {
              const row = cursor.value;
              await cursor.update({ ...row, timeSpentMs: row.timeSpentMs ?? null, variantQuestionLatex: row.variantQuestionLatex ?? null });
            }
          }
          if (oldVersion >= 2) {
            // Base tags move from one global set per account to one set per subject. Card links follow the card's
            // subject; the retired `careless` tag folds into `calculation`.
            const tagStore = tx.objectStore("AdaptiveTag");
            const linkStore = tx.objectStore("MistakeCardTag");
            const allTags = await tagStore.getAll();
            const globalBase = new Map(allTags.filter((t) => t.origin === "BASE" && t.subjectId === null).map((t) => [t.id, t]));
            if (globalBase.size > 0) {
              const cards = new Map((await tx.objectStore("MistakeCard").getAll()).map((c) => [c.id, c]));
              const languages = new Map((await tx.objectStore("User").getAll()).map((u) => [u.id, u.uiLanguage]));
              const tags = new Map(allTags.map((t) => [t.id, t]));
              const now = new Date();
              for (const link of await linkStore.getAll()) {
                const old = globalBase.get(link.tagId);
                if (!old) continue;
                await linkStore.delete([link.cardId, link.tagId]);
                const card = cards.get(link.cardId);
                const slug = RETIRED_BASE_TAG_SLUGS[old.slug] ?? old.slug;
                if (!card || !BASE_TAGS.some((b) => b.slug === slug)) continue;
                const id = baseTagId(card.subjectId, slug);
                const tag = tags.get(id) ?? baseTagRow(card.userId, card.subjectId, slug, languages.get(card.userId) ?? "VI", now);
                if (await linkStore.get([card.id, id])) continue;
                await linkStore.put({ ...link, tagId: id });
                const next = { ...tag, usageCount: tag.usageCount + 1, updatedAt: now };
                tags.set(id, next);
                await tagStore.put(next);
              }
              for (const id of globalBase.keys()) await tagStore.delete(id);
            }
          }
        }
      },
    });
    return this.dbPromise;
  }

  async init(): Promise<void> {
    const db = await this.db();
    if (await db.get("Meta", "seeded")) return;
    const seed = buildDemoSeed(new Date());
    const tx = db.transaction(["User", "Subject", "Topic", "MistakeCard", "CardAttemptLog", "Meta"], "readwrite");
    await Promise.all([
      ...seed.users.map((r) => tx.objectStore("User").put(r)),
      ...seed.subjects.map((r) => tx.objectStore("Subject").put(r)),
      ...seed.topics.map((r) => tx.objectStore("Topic").put(r)),
      ...seed.cards.map((r) => tx.objectStore("MistakeCard").put(r)),
      ...seed.logs.map((r) => tx.objectStore("CardAttemptLog").put(r)),
      tx.objectStore("Meta").put({ key: "seeded", value: new Date().toISOString() }),
      tx.done,
    ]);
  }

  async listUsers() {
    return (await (await this.db()).getAll("User")).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }

  async createUser(input: { displayName: string; email?: string }) {
    const now = new Date();
    const id = uuid();
    const user: User = {
      id, email: input.email?.trim() || `${slugify(input.displayName)}-${id.slice(0, 6)}@vaultlearn.local`, displayName: input.displayName.trim(),
      uiLanguage: "VI", defaultAiOutputLanguage: "VI", theme: "OBSIDIAN", timezone: "Asia/Ho_Chi_Minh", desiredRetention: 0.9,
      onboardedAt: now, lastActiveAt: now, createdAt: now, updatedAt: now,
    };
    await (await this.db()).put("User", user);
    return user;
  }

  async updateUser(userId: string, patch: UserPatch) {
    const db = await this.db();
    const user = await db.get("User", userId);
    if (!user) throw new Error("Account not found");
    const next = { ...user, ...patch, updatedAt: new Date() };
    await db.put("User", next);
    return next;
  }

  async deleteUser(userId: string) {
    const db = await this.db();
    const tx = db.transaction(["User", ...USER_STORES, "MistakeCardTag", "AiSynthesizedProblemSource"] as const, "readwrite");
    tx.objectStore("User").delete(userId);
    for (const cardId of await tx.objectStore("MistakeCard").index("userId").getAllKeys(userId)) {
      for (const key of await tx.objectStore("MistakeCardTag").index("cardId").getAllKeys(cardId)) tx.objectStore("MistakeCardTag").delete(key);
    }
    for (const problemId of await tx.objectStore("AiSynthesizedProblem").index("userId").getAllKeys(userId)) {
      for (const key of await tx.objectStore("AiSynthesizedProblemSource").index("problemId").getAllKeys(problemId)) tx.objectStore("AiSynthesizedProblemSource").delete(key);
    }
    for (const name of USER_STORES) {
      const store = tx.objectStore(name);
      for (const key of await store.index("userId").getAllKeys(userId)) store.delete(key);
    }
    await tx.done;
  }

  async loadSnapshot(userId: string): Promise<UserSnapshot | null> {
    const db = await this.db();
    const user = await db.get("User", userId);
    if (!user) return null;
    await this.ensureBaseTags(userId, user.uiLanguage);
    const [subjects, topics, apiKeys, cards, logs, tags, examUploads, allCardTags, personas, tagSuggestions, examPrepSessions, problems, allSources] = await Promise.all([
      db.getAllFromIndex("Subject", "userId", userId),
      db.getAllFromIndex("Topic", "userId", userId),
      db.getAllFromIndex("UserApiKey", "userId", userId),
      db.getAllFromIndex("MistakeCard", "userId", userId),
      db.getAllFromIndex("CardAttemptLog", "userId", userId),
      db.getAllFromIndex("AdaptiveTag", "userId", userId),
      db.getAllFromIndex("ExamUpload", "userId", userId),
      db.getAll("MistakeCardTag"),
      db.getAllFromIndex("UserAiPersona", "userId", userId),
      db.getAllFromIndex("TagSuggestionFeedback", "userId", userId),
      db.getAllFromIndex("ExamPrepSession", "userId", userId),
      db.getAllFromIndex("AiSynthesizedProblem", "userId", userId),
      db.getAll("AiSynthesizedProblemSource"),
    ]);
    const cardIds = new Set(cards.map((c) => c.id));
    const problemIds = new Set(problems.map((p) => p.id));
    const baseOrder = (tag: AdaptiveTag) => {
      const i = BASE_TAGS.findIndex((b) => b.slug === tag.slug);
      return tag.origin === "BASE" && i >= 0 ? i : BASE_TAGS.length;
    };
    const newestFirst = (a: { createdAt: Date }, b: { createdAt: Date }) => b.createdAt.getTime() - a.createdAt.getTime();
    return {
      user,
      subjects: subjects.sort((a, b) => a.sortOrder - b.sortOrder),
      topics: topics.sort((a, b) => a.sortOrder - b.sortOrder),
      apiKeys: apiKeys.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      cards,
      logs,
      tags: tags.sort((a, b) => baseOrder(a) - baseOrder(b) || a.createdAt.getTime() - b.createdAt.getTime() || a.name.localeCompare(b.name)),
      cardTags: allCardTags.filter((link) => cardIds.has(link.cardId)),
      examUploads: examUploads.sort(newestFirst),
      persona: personas[0] ?? null,
      tagSuggestions: tagSuggestions.sort(newestFirst),
      examPrepSessions: examPrepSessions.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
      synthesizedProblems: problems.sort(newestFirst),
      synthesisSources: allSources.filter((s) => problemIds.has(s.problemId)).sort((a, b) => a.position - b.position),
    };
  }

  /** Every subject has the four BASE error tags. Deterministic ids make concurrent calls idempotent. */
  private async ensureBaseTags(userId: string, language: Language) {
    const db = await this.db();
    const tx = db.transaction(["Subject", "AdaptiveTag"], "readwrite");
    const now = new Date();
    for (const subject of await tx.objectStore("Subject").index("userId").getAll(userId)) {
      for (const base of BASE_TAGS) {
        const id = baseTagId(subject.id, base.slug);
        if (await tx.objectStore("AdaptiveTag").get(id)) continue;
        await tx.objectStore("AdaptiveTag").put(baseTagRow(userId, subject.id, base.slug, language, now));
      }
    }
    await tx.done;
  }

  /** Fetch a row and assert it belongs to `userId`. */
  private async owned<S extends UserStore>(store: S, userId: string, id: string) {
    const row = await (await this.db()).get(store, id);
    if (!row || row.userId !== userId) throw new Error(`${store} not found`);
    return row;
  }

  async createSubject(userId: string, input: NewSubject) {
    const db = await this.db();
    const existing = await db.getAllFromIndex("Subject", "userId", userId);
    const base = slugify(input.name);
    let slug = base;
    for (let n = 2; existing.some((s) => s.slug === slug); n++) slug = `${base}-${n}`;
    const now = new Date();
    const subject: Subject = {
      id: uuid(), userId, name: input.name.trim(), slug, description: input.description?.trim() || null, color: input.color ?? null, icon: input.icon ?? null,
      aiOutputLanguage: input.aiOutputLanguage ?? null, preferredApiKeyId: input.preferredApiKeyId ?? null, examDate: input.examDate ?? null,
      sortOrder: existing.reduce((max, s) => Math.max(max, s.sortOrder + 1), 0), memorySummary: null, memoryInsights: null, memoryVersion: 0, memorySourceCardCount: 0,
      memoryStale: false, memoryUpdatedAt: null, archivedAt: null, createdAt: now, updatedAt: now,
    };
    await db.put("Subject", subject);
    return subject;
  }

  async updateSubject(userId: string, id: string, patch: SubjectPatch) {
    const subject = await this.owned("Subject", userId, id);
    const next: Subject = { ...subject, ...patch, updatedAt: new Date() };
    if (patch.name !== undefined) next.name = patch.name.trim();
    await (await this.db()).put("Subject", next);
    return next;
  }

  async deleteSubject(userId: string, id: string) {
    await this.owned("Subject", userId, id);
    const db = await this.db();
    const tx = db.transaction(
      ["Subject", "Topic", "MistakeCard", "CardAttemptLog", "MistakeCardTag", "StoredFile", "ExamUpload", "AdaptiveTag", "TagSuggestionFeedback", "ExamPrepSession", "AiSynthesizedProblem", "AiSynthesizedProblemSource"],
      "readwrite",
    );
    const cards = (await tx.objectStore("MistakeCard").index("userId").getAll(userId)).filter((c) => c.subjectId === id);
    const cardIds = new Set(cards.map((c) => c.id));
    for (const card of cards) {
      for (const key of await tx.objectStore("MistakeCardTag").index("cardId").getAllKeys(card.id)) tx.objectStore("MistakeCardTag").delete(key);
      for (const path of [card.diagramImagePath, card.originalCropPath]) if (path) tx.objectStore("StoredFile").delete(path);
    }
    for (const upload of await tx.objectStore("ExamUpload").index("userId").getAll(userId)) {
      if (upload.subjectId === id) tx.objectStore("ExamUpload").put({ ...upload, subjectId: null, updatedAt: new Date() });
    }
    for (const log of await tx.objectStore("CardAttemptLog").index("userId").getAll(userId)) {
      if (cardIds.has(log.cardId)) tx.objectStore("CardAttemptLog").delete(log.id);
    }
    for (const card of cards) tx.objectStore("MistakeCard").delete(card.id);
    for (const topic of await tx.objectStore("Topic").index("userId").getAll(userId)) {
      if (topic.subjectId === id) tx.objectStore("Topic").delete(topic.id);
    }
    // Subject-scoped tags (their remaining links belonged to this subject's cards, removed above).
    for (const tag of await tx.objectStore("AdaptiveTag").index("userId").getAll(userId)) {
      if (tag.subjectId === id) tx.objectStore("AdaptiveTag").delete(tag.id);
    }
    for (const suggestion of await tx.objectStore("TagSuggestionFeedback").index("userId").getAll(userId)) {
      if (suggestion.subjectId === id) tx.objectStore("TagSuggestionFeedback").delete(suggestion.id);
    }
    for (const prep of await tx.objectStore("ExamPrepSession").index("userId").getAll(userId)) {
      if (prep.subjectId === id) tx.objectStore("ExamPrepSession").delete(prep.id);
    }
    for (const problem of await tx.objectStore("AiSynthesizedProblem").index("userId").getAll(userId)) {
      if (problem.subjectId !== id) continue;
      for (const key of await tx.objectStore("AiSynthesizedProblemSource").index("problemId").getAllKeys(problem.id)) tx.objectStore("AiSynthesizedProblemSource").delete(key);
      tx.objectStore("AiSynthesizedProblem").delete(problem.id);
    }
    tx.objectStore("Subject").delete(id);
    await tx.done;
  }

  async createTopic(userId: string, input: { subjectId: string; name: string; parentId?: string | null }) {
    await this.owned("Subject", userId, input.subjectId);
    const db = await this.db();
    const siblings = (await db.getAllFromIndex("Topic", "userId", userId)).filter(
      (t) => t.subjectId === input.subjectId && t.parentId === (input.parentId ?? null),
    );
    if (input.parentId) {
      const parent = await this.owned("Topic", userId, input.parentId);
      if (parent.subjectId !== input.subjectId || parent.parentId !== null) throw new Error("Topics nest only one level deep");
    }
    const all = (await db.getAllFromIndex("Topic", "userId", userId)).filter((t) => t.subjectId === input.subjectId);
    const base = slugify(input.name);
    let slug = base;
    for (let n = 2; all.some((t) => t.slug === slug); n++) slug = `${base}-${n}`;
    const now = new Date();
    const topic: Topic = {
      id: uuid(), userId, subjectId: input.subjectId, parentId: input.parentId ?? null, name: input.name.trim(), slug,
      sortOrder: siblings.reduce((max, t) => Math.max(max, t.sortOrder + 1), 0), createdAt: now, updatedAt: now,
    };
    await db.put("Topic", topic);
    return topic;
  }

  async updateTopic(userId: string, id: string, patch: { name?: string; sortOrder?: number }) {
    const topic = await this.owned("Topic", userId, id);
    const next: Topic = { ...topic, updatedAt: new Date() };
    if (patch.name !== undefined) next.name = patch.name.trim();
    if (patch.sortOrder !== undefined) next.sortOrder = patch.sortOrder;
    await (await this.db()).put("Topic", next);
    return next;
  }

  async deleteTopic(userId: string, id: string) {
    await this.owned("Topic", userId, id);
    const db = await this.db();
    const tx = db.transaction(["Topic", "MistakeCard", "ExamPrepSession", "AiSynthesizedProblem"], "readwrite");
    const doomed = new Set([id]);
    for (const topic of await tx.objectStore("Topic").index("userId").getAll(userId)) {
      if (topic.parentId === id) doomed.add(topic.id);
    }
    const now = new Date();
    for (const card of await tx.objectStore("MistakeCard").index("userId").getAll(userId)) {
      if (card.topicId && doomed.has(card.topicId)) tx.objectStore("MistakeCard").put({ ...card, topicId: null, updatedAt: now });
    }
    for (const problem of await tx.objectStore("AiSynthesizedProblem").index("userId").getAll(userId)) {
      if (problem.topicId && doomed.has(problem.topicId)) tx.objectStore("AiSynthesizedProblem").put({ ...problem, topicId: null, updatedAt: now });
    }
    for (const prep of await tx.objectStore("ExamPrepSession").index("userId").getAll(userId)) {
      if (prep.topicIds.some((t) => doomed.has(t))) tx.objectStore("ExamPrepSession").put({ ...prep, topicIds: prep.topicIds.filter((t) => !doomed.has(t)), updatedAt: now });
    }
    for (const topicId of doomed) tx.objectStore("Topic").delete(topicId);
    await tx.done;
  }

  async createApiKey(userId: string, input: NewApiKey) {
    const db = await this.db();
    const existing = await db.getAllFromIndex("UserApiKey", "userId", userId);
    if (existing.some((k) => k.label.toLowerCase() === input.label.trim().toLowerCase())) throw new Error("DUPLICATE_LABEL");
    const now = new Date();
    const isDefault = input.isDefault === true || existing.length === 0;
    const key: UserApiKey = {
      id: uuid(), userId, provider: input.provider, label: input.label.trim(), encryptedKey: input.encryptedKey, encryptionKeyId: input.encryptionKeyId,
      keyHint: input.keyHint, baseUrl: input.baseUrl ?? null, defaultModel: input.defaultModel ?? null, visionModel: input.visionModel ?? null,
      aiOutputLanguage: input.aiOutputLanguage ?? null, isDefault, isActive: true, lastUsedAt: null, lastValidatedAt: null, lastErrorMessage: null,
      createdAt: now, updatedAt: now,
    };
    const tx = db.transaction("UserApiKey", "readwrite");
    if (isDefault) for (const other of existing) if (other.isDefault) tx.store.put({ ...other, isDefault: false });
    tx.store.put(key);
    await tx.done;
    return key;
  }

  async updateApiKey(userId: string, id: string, patch: ApiKeyPatch) {
    const key = await this.owned("UserApiKey", userId, id);
    const db = await this.db();
    const next: UserApiKey = { ...key, ...patch, updatedAt: new Date() };
    const tx = db.transaction("UserApiKey", "readwrite");
    if (patch.isDefault) {
      for (const other of await tx.store.index("userId").getAll(userId)) if (other.id !== id && other.isDefault) tx.store.put({ ...other, isDefault: false });
    }
    tx.store.put(next);
    await tx.done;
    return next;
  }

  async deleteApiKey(userId: string, id: string) {
    await this.owned("UserApiKey", userId, id);
    const db = await this.db();
    const tx = db.transaction(["UserApiKey", "Subject", "AiSynthesizedProblem"], "readwrite");
    for (const subject of await tx.objectStore("Subject").index("userId").getAll(userId)) {
      if (subject.preferredApiKeyId === id) tx.objectStore("Subject").put({ ...subject, preferredApiKeyId: null, updatedAt: new Date() });
    }
    for (const problem of await tx.objectStore("AiSynthesizedProblem").index("userId").getAll(userId)) {
      if (problem.apiKeyId === id) tx.objectStore("AiSynthesizedProblem").put({ ...problem, apiKeyId: null });
    }
    tx.objectStore("UserApiKey").delete(id);
    await tx.done;
  }

  async saveScannedCards(userId: string, input: { upload: NewExamUpload; cards: NewScannedCard[] }): Promise<SaveScanResult> {
    if (input.cards.length === 0) throw new Error("NO_CARDS");
    const db = await this.db();
    const tx = db.transaction(["Subject", "Topic", "MistakeCard", "ExamUpload", "AdaptiveTag", "MistakeCardTag", "StoredFile"], "readwrite");
    const [subjects, topics, tags, uploads] = await Promise.all([
      tx.objectStore("Subject").index("userId").getAll(userId),
      tx.objectStore("Topic").index("userId").getAll(userId),
      tx.objectStore("AdaptiveTag").index("userId").getAll(userId),
      tx.objectStore("ExamUpload").index("userId").getAll(userId),
    ]);
    const files = tx.objectStore("StoredFile");
    const now = new Date();

    // Validate everything before the first write so a bad card cannot leave a half-saved scan behind.
    const subjectIds = new Set(subjects.map((s) => s.id));
    const liveTags = new Map(tags.filter((tag) => tag.archivedAt === null && tag.mergedIntoId === null).map((tag) => [tag.id, tag]));
    if (input.upload.subjectId && !subjectIds.has(input.upload.subjectId)) throw new Error("Subject not found");
    for (const card of input.cards) {
      if (!subjectIds.has(card.subjectId)) throw new Error("Subject not found");
      if (card.topicId && !topics.some((tp) => tp.id === card.topicId && tp.subjectId === card.subjectId)) throw new Error("Topic not found");
      if (card.tagIds.some((tagId) => !liveTags.has(tagId))) throw new Error("Tag not found");
      if (!card.questionLatex.trim()) throw new Error("EMPTY_QUESTION");
    }

    let upload = uploads.find((u) => u.sha256 === input.upload.sha256);
    if (!upload) {
      const { files: blobs, fileKind } = input.upload;
      if (blobs.length === 0 || (fileKind === "PDF" && blobs.length !== 1)) throw new Error("INVALID_UPLOAD");
      const id = uuid();
      const base = slugify(input.upload.title);
      const paths = blobs.map((blob, i) => {
        const ext = fileKind === "PDF" ? "pdf" : (blob.type.split("/")[1] ?? "jpg").replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
        return `local/${userId}/uploads/${id}/${base}${blobs.length > 1 ? `-p${i + 1}` : ""}.${ext}`;
      });
      upload = {
        id, userId, subjectId: input.upload.subjectId ?? null, title: input.upload.title.trim(), sourceLabel: input.upload.sourceLabel?.trim() || null,
        fileKind, mimeType: input.upload.mimeType, storageBucket: null, storagePath: paths[0], pageStoragePaths: fileKind === "IMAGE" ? paths : [],
        fileSizeBytes: input.upload.fileSizeBytes, pageCount: input.upload.pageCount, sha256: input.upload.sha256, createdAt: now, updatedAt: now,
      };
      await tx.objectStore("ExamUpload").put(upload);
      await Promise.all(blobs.map((blob, i) => files.put({ path: paths[i], userId, mimeType: blob.type || input.upload.mimeType, blob, createdAt: now })));
    }

    const created: MistakeCard[] = [];
    const tagUses = new Map<string, number>();
    const touchedSubjects = new Set<string>();
    for (const card of input.cards) {
      const id = uuid();
      const base = `local/${userId}/cards/${id}`;
      const originalCropPath = card.originalCrop ? `${base}/original.jpg` : null;
      const diagramImagePath = card.diagramImage ? `${base}/diagram.png` : null;
      if (card.originalCrop && originalCropPath) await files.put({ path: originalCropPath, userId, mimeType: card.originalCrop.type || "image/jpeg", blob: card.originalCrop, createdAt: now });
      if (card.diagramImage && diagramImagePath) await files.put({ path: diagramImagePath, userId, mimeType: card.diagramImage.type || "image/png", blob: card.diagramImage, createdAt: now });
      const row: MistakeCard = {
        id, userId, subjectId: card.subjectId, topicId: card.topicId ?? null, examUploadId: upload.id, title: card.title?.trim() || null,
        questionLatex: card.questionLatex.trim(), userAnswerLatex: null, correctAnswerLatex: null, solutionLatex: card.solutionLatex?.trim() || null,
        sourcePage: card.sourcePage, cropBox: card.cropBox, figureBox: card.figureBox ?? null, diagramImagePath, originalCropPath, ocrStatus: card.ocrStatus,
        ocrModel: card.ocrModel ?? null, ocrConfidence: card.ocrConfidence ?? null, ocrRawText: card.ocrRawText ?? null,
        ahaNote: card.ahaNote?.trim() || null, isHighYield: card.isHighYield, highYieldNote: card.highYieldNote?.trim() || null,
        state: "NEW", due: now, stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0, lastReviewAt: null,
        attemptCount: 0, isSuspended: false, archivedAt: null, createdAt: now, updatedAt: now,
      };
      await tx.objectStore("MistakeCard").put(row);
      for (const tagId of new Set(card.tagIds)) {
        // A tag from another subject (the draft's subject changed after tagging) is dropped rather than failing the save.
        const tag = liveTags.get(tagId);
        if (!tag || (tag.subjectId !== null && tag.subjectId !== card.subjectId)) continue;
        await tx.objectStore("MistakeCardTag").put({ cardId: id, tagId, assignedBy: "USER", confidence: null, createdAt: now });
        tagUses.set(tagId, (tagUses.get(tagId) ?? 0) + 1);
      }
      touchedSubjects.add(card.subjectId);
      created.push(row);
    }
    for (const [tagId, uses] of tagUses) {
      const tag = liveTags.get(tagId);
      if (tag) await tx.objectStore("AdaptiveTag").put({ ...tag, usageCount: tag.usageCount + uses, updatedAt: now });
    }
    for (const subject of subjects) {
      if (touchedSubjects.has(subject.id)) await tx.objectStore("Subject").put({ ...subject, memoryStale: true, updatedAt: now });
    }
    await tx.done;
    return { upload, cards: created };
  }

  async getBlob(userId: string, path: string): Promise<Blob | null> {
    const file = await (await this.db()).get("StoredFile", path);
    return file && file.userId === userId ? file.blob : null;
  }

  // ── Phase 4: review arena ─────────────────────────────────────────────

  async reviewCard(userId: string, input: ReviewInput): Promise<{ card: MistakeCard; log: CardAttemptLog }> {
    const db = await this.db();
    const tx = db.transaction(["User", "MistakeCard", "CardAttemptLog", "Subject"], "readwrite");
    const user = await tx.objectStore("User").get(userId);
    const card = await tx.objectStore("MistakeCard").get(input.cardId);
    if (!user || !card || card.userId !== userId) throw new Error("MistakeCard not found");
    const { card: scheduled, log: fsrsLog } = scheduleReview(card, input.rating, input.reviewedAt, user);
    // attemptCount is read and bumped inside this readwrite transaction, so attempt numbers stay sequential.
    const attemptNumber = card.attemptCount + 1;
    const log: CardAttemptLog = {
      id: uuid(), userId, cardId: card.id, attemptNumber, note: cleanNote(input.note),
      timeSpentMs: input.timeSpentMs != null && Number.isFinite(input.timeSpentMs) ? Math.max(0, Math.round(input.timeSpentMs)) : null,
      variantQuestionLatex: input.variantQuestionLatex?.trim() || null, ...fsrsLog,
    };
    const next: MistakeCard = { ...card, ...scheduled, attemptCount: attemptNumber, updatedAt: input.reviewedAt };
    await tx.objectStore("CardAttemptLog").put(log);
    await tx.objectStore("MistakeCard").put(next);
    const subject = await tx.objectStore("Subject").get(card.subjectId);
    if (subject && !subject.memoryStale) await tx.objectStore("Subject").put({ ...subject, memoryStale: true, updatedAt: input.reviewedAt });
    await tx.done;
    return { card: next, log };
  }

  async updateCard(userId: string, id: string, patch: CardPatch): Promise<MistakeCard> {
    const card = await this.owned("MistakeCard", userId, id);
    if (patch.topicId) {
      const topic = await this.owned("Topic", userId, patch.topicId);
      if (topic.subjectId !== card.subjectId) throw new Error("Topic not found");
    }
    const now = new Date();
    const next: MistakeCard = { ...card, ...patch, updatedAt: now };
    for (const key of ["solutionLatex", "ahaNote", "highYieldNote"] as const) if (patch[key] !== undefined) next[key] = patch[key]?.trim() || null;
    const db = await this.db();
    const tx = db.transaction(["MistakeCard", "Subject"], "readwrite");
    await tx.objectStore("MistakeCard").put(next);
    const subject = await tx.objectStore("Subject").get(card.subjectId);
    if (subject) await tx.objectStore("Subject").put({ ...subject, memoryStale: true, updatedAt: now });
    await tx.done;
    return next;
  }

  async setCardTags(userId: string, cardId: string, tagIds: string[]): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(["MistakeCard", "MistakeCardTag", "AdaptiveTag", "Subject"], "readwrite");
    const card = await tx.objectStore("MistakeCard").get(cardId);
    if (!card || card.userId !== userId) throw new Error("MistakeCard not found");
    const allowed = new Map(tagsForSubject(await tx.objectStore("AdaptiveTag").index("userId").getAll(userId), card.subjectId).map((t) => [t.id, t]));
    const wanted = new Set(tagIds);
    for (const tagId of wanted) if (!allowed.has(tagId)) throw new Error("Tag not found");
    const links = await tx.objectStore("MistakeCardTag").index("cardId").getAll(cardId);
    const current = new Set(links.map((l) => l.tagId));
    const now = new Date();
    const bump = async (tagId: string, delta: number) => {
      const tag = allowed.get(tagId) ?? (await tx.objectStore("AdaptiveTag").get(tagId));
      if (tag) await tx.objectStore("AdaptiveTag").put({ ...tag, usageCount: Math.max(0, tag.usageCount + delta), updatedAt: now });
    };
    for (const link of links) {
      if (wanted.has(link.tagId)) continue;
      await tx.objectStore("MistakeCardTag").delete([cardId, link.tagId]);
      await bump(link.tagId, -1);
    }
    for (const tagId of wanted) {
      if (current.has(tagId)) continue;
      await tx.objectStore("MistakeCardTag").put({ cardId, tagId, assignedBy: "USER", confidence: null, createdAt: now });
      await bump(tagId, 1);
    }
    const subject = await tx.objectStore("Subject").get(card.subjectId);
    if (subject) await tx.objectStore("Subject").put({ ...subject, memoryStale: true, updatedAt: now });
    await tx.done;
  }

  // ── Phase 4: Second Brain ─────────────────────────────────────────────

  async saveSubjectMemory(userId: string, subjectId: string, input: SubjectMemoryInput): Promise<Subject> {
    const subject = await this.owned("Subject", userId, subjectId);
    const now = new Date();
    const summary = input.memorySummary.replace(/\r\n?/g, "\n").trim().slice(0, 4000);
    const next: Subject = {
      ...subject,
      memorySummary: summary || null,
      memoryInsights: input.memoryInsights ? normalizeInsights(input.memoryInsights) : null,
      memoryVersion: subject.memoryVersion + 1,
      memoryUpdatedAt: now,
      updatedAt: now,
      ...(input.source === "sync" ? { memoryStale: false, memorySourceCardCount: input.memorySourceCardCount ?? subject.memorySourceCardCount } : {}),
    };
    await (await this.db()).put("Subject", next);
    return next;
  }

  async updatePersona(userId: string, patch: PersonaPatch): Promise<UserAiPersona> {
    const db = await this.db();
    const tx = db.transaction("UserAiPersona", "readwrite");
    const now = new Date();
    const current = (await tx.store.index("userId").getAll(userId))[0] ?? emptyPersona(userId, now);
    const { synced, ...fields } = patch;
    const list = (items: string[] | undefined) => items?.map((s) => s.trim()).filter(Boolean).slice(0, 8);
    const next: UserAiPersona = {
      ...current,
      ...fields,
      summary: fields.summary !== undefined ? fields.summary.trim().slice(0, 2400) : current.summary,
      strengths: list(fields.strengths) ?? current.strengths,
      weaknesses: list(fields.weaknesses) ?? current.weaknesses,
      updatedAt: now,
      ...(synced ? { version: current.version + 1, lastSyncedAt: now, isStale: false } : {}),
    };
    await tx.store.put(next);
    await tx.done;
    return next;
  }

  // ── Phase 4: adaptive tags ────────────────────────────────────────────

  async addTagSuggestions(userId: string, subjectId: string, suggestions: NewTagSuggestion[]): Promise<TagSuggestionFeedback[]> {
    await this.owned("Subject", userId, subjectId);
    const db = await this.db();
    const tx = db.transaction(["AdaptiveTag", "TagSuggestionFeedback", "MistakeCard"], "readwrite");
    const live = tagsForSubject(await tx.objectStore("AdaptiveTag").index("userId").getAll(userId), subjectId);
    const existing = (await tx.objectStore("TagSuggestionFeedback").index("userId").getAll(userId)).filter((s) => s.subjectId === subjectId);
    const subjectCards = new Set((await tx.objectStore("MistakeCard").index("userId").getAll(userId)).filter((c) => c.subjectId === subjectId).map((c) => c.id));
    const now = new Date();
    const created: TagSuggestionFeedback[] = [];
    for (const s of suggestions) {
      const name = s.proposedName.replace(/\s+/g, " ").trim().slice(0, 60);
      if (!name || !s.rationale.trim()) continue;
      if (live.some((tag) => tagNames(tag).some((n) => sameTagName(n, name)))) continue;
      if ([...existing, ...created].some((e) => e.proposedName && sameTagName(e.proposedName, name))) continue;
      const target = s.kind === "RENAME" ? live.find((tag) => tag.id === s.targetTagId) : undefined;
      if (s.kind === "RENAME" && (!target || existing.some((e) => e.status === "PENDING" && e.targetTagId === target.id))) continue;
      const row: TagSuggestionFeedback = {
        id: uuid(), userId, subjectId, kind: s.kind, targetTagId: target?.id ?? null, mergeIntoTagId: null, proposedName: name,
        proposedDescription: s.proposedDescription?.trim().slice(0, 300) || null, rationale: s.rationale.trim().slice(0, 600),
        evidenceCardIds: [...new Set(s.evidenceCardIds)].filter((id) => subjectCards.has(id)).slice(0, 12), status: "PENDING", rejectionReason: null,
        resultingTagId: null, aiProvider: s.aiProvider, aiModel: s.aiModel, outputLanguage: s.outputLanguage, createdAt: new Date(now.getTime() + created.length), resolvedAt: null,
      };
      await tx.objectStore("TagSuggestionFeedback").put(row);
      created.push(row);
    }
    // Keep the banner short: only the newest few stay pending.
    const pending = [...existing.filter((e) => e.status === "PENDING"), ...created].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    for (const stale of pending.slice(MAX_PENDING_TAG_SUGGESTIONS)) {
      await tx.objectStore("TagSuggestionFeedback").put({ ...stale, status: "EXPIRED", resolvedAt: now });
    }
    await tx.done;
    return created;
  }

  async acceptTagSuggestion(userId: string, id: string): Promise<AdaptiveTag> {
    const db = await this.db();
    const tx = db.transaction(["TagSuggestionFeedback", "AdaptiveTag", "MistakeCardTag", "MistakeCard", "Subject"], "readwrite");
    const suggestion = await tx.objectStore("TagSuggestionFeedback").get(id);
    if (!suggestion || suggestion.userId !== userId) throw new Error("TagSuggestionFeedback not found");
    if (suggestion.status !== "PENDING") throw new Error("SUGGESTION_RESOLVED");
    if (!suggestion.subjectId || !suggestion.proposedName) throw new Error("INVALID_SUGGESTION");
    const subjectId = suggestion.subjectId;
    const allTags = await tx.objectStore("AdaptiveTag").index("userId").getAll(userId);
    const live = tagsForSubject(allTags, subjectId);
    const now = new Date();
    let result: AdaptiveTag;

    if (suggestion.kind === "CREATE") {
      const scoped = allTags.filter((t) => t.scopeKey === tagScopeKey(subjectId));
      const usedColors = new Set(live.map((t) => t.color));
      const cards = new Set((await tx.objectStore("MistakeCard").index("userId").getAll(userId)).filter((c) => c.subjectId === subjectId).map((c) => c.id));
      const evidence = suggestion.evidenceCardIds.filter((cardId) => cards.has(cardId));
      result = {
        id: uuid(), userId, subjectId, scopeKey: tagScopeKey(subjectId), name: suggestion.proposedName, slug: uniqueSlug(suggestion.proposedName, scoped.map((t) => t.slug)),
        i18nKey: null, description: suggestion.proposedDescription, color: SUBJECT_COLORS.find((c) => !usedColors.has(c)) ?? SUBJECT_COLORS[live.length % SUBJECT_COLORS.length],
        origin: "AI_ACCEPTED", usageCount: evidence.length, mergedIntoId: null, archivedAt: null, createdAt: now, updatedAt: now,
      };
      await tx.objectStore("AdaptiveTag").put(result);
      // The cards whose notes motivated the tag get it right away (marked as AI-assigned).
      for (const cardId of evidence) await tx.objectStore("MistakeCardTag").put({ cardId, tagId: result.id, assignedBy: "AI", confidence: null, createdAt: now });
    } else if (suggestion.kind === "RENAME") {
      const target = live.find((t) => t.id === suggestion.targetTagId);
      if (!target) throw new Error("Tag not found");
      // Clearing i18nKey pins the new name (a base tag no longer follows the GUI language).
      result = { ...target, name: suggestion.proposedName, i18nKey: null, description: suggestion.proposedDescription ?? target.description, updatedAt: now };
      await tx.objectStore("AdaptiveTag").put(result);
    } else {
      throw new Error("UNSUPPORTED_SUGGESTION");
    }

    await tx.objectStore("TagSuggestionFeedback").put({ ...suggestion, status: "ACCEPTED", resolvedAt: now, resultingTagId: result.id });
    const subject = await tx.objectStore("Subject").get(subjectId);
    if (subject) await tx.objectStore("Subject").put({ ...subject, memoryStale: true, updatedAt: now });
    await tx.done;
    return result;
  }

  async rejectTagSuggestion(userId: string, id: string, reason: TagDeclineReason, detail?: string | null): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(["TagSuggestionFeedback", "UserAiPersona"], "readwrite");
    const suggestion = await tx.objectStore("TagSuggestionFeedback").get(id);
    if (!suggestion || suggestion.userId !== userId) throw new Error("TagSuggestionFeedback not found");
    if (suggestion.status !== "PENDING") throw new Error("SUGGESTION_RESOLVED");
    const now = new Date();
    const stored = formatDeclineReason(reason, detail);
    await tx.objectStore("TagSuggestionFeedback").put({ ...suggestion, status: "REJECTED", rejectionReason: stored, resolvedAt: now });
    // Feed the preference into the Second Brain: future tag prompts read it from the persona.
    const persona = (await tx.objectStore("UserAiPersona").index("userId").getAll(userId))[0] ?? emptyPersona(userId, now);
    const entry = { at: now.toISOString(), subjectId: suggestion.subjectId, kind: suggestion.kind, proposedName: suggestion.proposedName, reason, detail: reason === "other" ? (detail?.trim() || null) : null };
    await tx.objectStore("UserAiPersona").put({ ...persona, preferences: rememberTagFeedback(persona.preferences, entry), updatedAt: now });
    await tx.done;
  }

  // ── Phase 4: scoped exam prep & synthesizer ───────────────────────────

  async createExamPrepSession(userId: string, input: NewExamPrepSession): Promise<ExamPrepSession> {
    await this.owned("Subject", userId, input.subjectId);
    const db = await this.db();
    const [topics, tags] = await Promise.all([db.getAllFromIndex("Topic", "userId", userId), db.getAllFromIndex("AdaptiveTag", "userId", userId)]);
    const topicIds = new Set(topics.filter((t) => t.subjectId === input.subjectId).map((t) => t.id));
    const tagIds = new Set(tagsForSubject(tags, input.subjectId).map((t) => t.id));
    const title = input.title.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!title) throw new Error("EMPTY_TITLE");
    const now = new Date();
    const session: ExamPrepSession = {
      id: uuid(), userId, subjectId: input.subjectId, title, examDate: input.examDate ?? null, topicIds: [...new Set(input.topicIds ?? [])].filter((t) => topicIds.has(t)),
      tagIds: [...new Set(input.tagIds ?? [])].filter((t) => tagIds.has(t)), fromDate: null, toDate: null, highYieldOnly: input.highYieldOnly ?? false, includeSynthesized: true,
      targetProblemCount: null, status: "ACTIVE", createdAt: now, updatedAt: now,
    };
    await db.put("ExamPrepSession", session);
    return session;
  }

  async deleteExamPrepSession(userId: string, id: string): Promise<void> {
    await this.owned("ExamPrepSession", userId, id);
    const db = await this.db();
    const tx = db.transaction(["ExamPrepSession", "AiSynthesizedProblem"], "readwrite");
    for (const problem of await tx.objectStore("AiSynthesizedProblem").index("userId").getAll(userId)) {
      if (problem.examPrepSessionId === id) await tx.objectStore("AiSynthesizedProblem").put({ ...problem, examPrepSessionId: null });
    }
    await tx.objectStore("ExamPrepSession").delete(id);
    await tx.done;
  }

  async saveSynthesizedProblem(userId: string, input: NewSynthesizedProblem): Promise<AiSynthesizedProblem> {
    await this.owned("Subject", userId, input.subjectId);
    if (input.examPrepSessionId) {
      const prep = await this.owned("ExamPrepSession", userId, input.examPrepSessionId);
      if (prep.subjectId !== input.subjectId) throw new Error("ExamPrepSession not found");
    }
    const db = await this.db();
    const tx = db.transaction(["MistakeCard", "AiSynthesizedProblem", "AiSynthesizedProblemSource"], "readwrite");
    const sources: MistakeCard[] = [];
    for (const cardId of input.sourceCardIds) {
      const card = await tx.objectStore("MistakeCard").get(cardId);
      if (!card || card.userId !== userId || card.subjectId !== input.subjectId) throw new Error("MistakeCard not found");
      sources.push(card);
    }
    if (sources.length === 0 || (input.mode === "CLONE" && sources.length !== 1) || (input.mode === "MIX" && (sources.length < 2 || sources.length > 3))) throw new Error("INVALID_SOURCES");
    const sharedTopic = sources.every((c) => c.topicId === sources[0].topicId) ? sources[0].topicId : null;
    const now = new Date();
    const problem: AiSynthesizedProblem = {
      id: uuid(), userId, subjectId: input.subjectId, topicId: input.topicId ?? sharedTopic, examPrepSessionId: input.examPrepSessionId ?? null, mode: input.mode,
      questionLatex: input.questionLatex.trim(), answerLatex: input.answerLatex?.trim() || null, solutionLatex: input.solutionLatex?.trim() || null,
      diagramDescription: input.diagramDescription?.trim() || null, difficultyEstimate: input.difficultyEstimate ?? null, verificationLatex: input.verificationLatex?.trim() || null,
      revision: 0, isExperimental: true, usedHighYield: input.usedHighYield, outputLanguage: input.outputLanguage, apiKeyId: input.apiKeyId ?? null, aiProvider: input.aiProvider,
      aiModel: input.aiModel, promptVersion: input.promptVersion, userRating: null, isFlaggedIncorrect: false, flagReason: null, promotedCardId: null, createdAt: now, updatedAt: now,
    };
    await tx.objectStore("AiSynthesizedProblem").put(problem);
    for (const [position, card] of sources.entries()) await tx.objectStore("AiSynthesizedProblemSource").put({ problemId: problem.id, cardId: card.id, position });
    await tx.done;
    return problem;
  }

  async updateSynthesizedProblem(userId: string, id: string, patch: SynthesizedProblemPatch): Promise<AiSynthesizedProblem> {
    const problem = await this.owned("AiSynthesizedProblem", userId, id);
    const { revised, ...fields } = patch;
    // isExperimental can never be cleared: an AI problem stays "experimental" even after a fix.
    const next: AiSynthesizedProblem = { ...problem, ...fields, isExperimental: true, revision: problem.revision + (revised ? 1 : 0), updatedAt: new Date() };
    await (await this.db()).put("AiSynthesizedProblem", next);
    return next;
  }

  async promoteSynthesizedProblem(userId: string, id: string): Promise<MistakeCard> {
    const db = await this.db();
    const tx = db.transaction(["AiSynthesizedProblem", "MistakeCard", "Subject"], "readwrite");
    const problem = await tx.objectStore("AiSynthesizedProblem").get(id);
    if (!problem || problem.userId !== userId) throw new Error("AiSynthesizedProblem not found");
    if (problem.promotedCardId) {
      const existing = await tx.objectStore("MistakeCard").get(problem.promotedCardId);
      if (existing) {
        await tx.done;
        return existing;
      }
    }
    const now = new Date();
    const card: MistakeCard = {
      id: uuid(), userId, subjectId: problem.subjectId, topicId: problem.topicId, examUploadId: null, title: null, questionLatex: problem.questionLatex, userAnswerLatex: null,
      correctAnswerLatex: problem.answerLatex, solutionLatex: problem.solutionLatex, sourcePage: null, cropBox: null, figureBox: null, diagramImagePath: null, originalCropPath: null,
      ocrStatus: "MANUAL", ocrModel: problem.aiModel, ocrConfidence: null, ocrRawText: null, ahaNote: null, isHighYield: false, highYieldNote: null, state: "NEW", due: now,
      stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0, lastReviewAt: null, attemptCount: 0, isSuspended: false, archivedAt: null,
      createdAt: now, updatedAt: now,
    };
    await tx.objectStore("MistakeCard").put(card);
    await tx.objectStore("AiSynthesizedProblem").put({ ...problem, promotedCardId: card.id, updatedAt: now });
    const subject = await tx.objectStore("Subject").get(problem.subjectId);
    if (subject) await tx.objectStore("Subject").put({ ...subject, memoryStale: true, updatedAt: now });
    await tx.done;
    return card;
  }

  async deleteSynthesizedProblem(userId: string, id: string): Promise<void> {
    await this.owned("AiSynthesizedProblem", userId, id);
    const db = await this.db();
    const tx = db.transaction(["AiSynthesizedProblem", "AiSynthesizedProblemSource"], "readwrite");
    for (const key of await tx.objectStore("AiSynthesizedProblemSource").index("problemId").getAllKeys(id)) await tx.objectStore("AiSynthesizedProblemSource").delete(key);
    await tx.objectStore("AiSynthesizedProblem").delete(id);
    await tx.done;
  }
}

let instance: Repository | null = null;

/**
 * Remote (Prisma) repository is not wired up yet (Phase 2 ships local mode); both modes currently resolve here.
 */
export function getRepository(): Repository {
  instance ??= new LocalRepository();
  return instance;
}
