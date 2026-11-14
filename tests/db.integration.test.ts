/**
 * Database integration test — runs only when TEST_DATABASE_URL points at a disposable, migrated Postgres:
 *
 *   npx prisma dev -n vaultlearn-test -d                       # or any throwaway Postgres
 *   DATABASE_URL=<url> npx prisma migrate deploy
 *   TEST_DATABASE_URL=<url> npm test
 *
 * Every row it creates hangs off throwaway test users and is removed via cascade at the end.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { BASE_TAGS, tagScopeKey } from "@/lib/constants";
import { apiKeyContext, createVault, generateMasterKey } from "@/lib/crypto";
import { FSRS, createEmptyCard } from "@/lib/fsrs";
import { PrismaRepository } from "@/lib/repo/prisma";
import { RepoError } from "@/lib/repo/types";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("Prisma schema against Postgres", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  const email = `it-${Date.now()}@vaultlearn.test`;
  let userId = "";

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it("stores a full mistake-card lifecycle and cascades on user delete", async () => {
    const user = await prisma.user.create({ data: { email } });
    userId = user.id;
    expect(user.uiLanguage).toBe("VI");
    expect(user.fsrsWeights).toEqual([]);
    // Account defaults: regular user, light theme, credentials auth.
    expect(user).toMatchObject({ role: "USER", theme: "LIGHT", authProvider: "CREDENTIALS", passwordHash: null });
    await expect(prisma.user.create({ data: { email } })).rejects.toMatchObject({ code: "P2002" });
    await prisma.account.create({ data: { userId, type: "oauth", provider: "test", providerAccountId: "p-1" } });
    await prisma.session.create({ data: { userId, sessionToken: `tok-${email}`, expires: new Date(Date.now() + 60_000) } });
    await prisma.storedFile.create({ data: { path: `u/${userId}/x.bin`, userId, mimeType: "image/png", sizeBytes: 3, data: new Uint8Array([1, 2, 3]) } });

    // BYOK key (ciphertext only)
    const vault = createVault(generateMasterKey());
    const apiKey = await prisma.userApiKey.create({
      data: {
        userId,
        provider: "OPENAI",
        label: "Personal",
        encryptedKey: vault.encrypt("sk-test-123456", apiKeyContext(userId, "OPENAI")),
        encryptionKeyId: vault.primaryKeyId,
        keyHint: "3456",
        aiOutputLanguage: "EN",
      },
    });
    expect(vault.decrypt(apiKey.encryptedKey, apiKeyContext(userId, "OPENAI"))).toBe("sk-test-123456");

    await prisma.userAiPersona.create({ data: { userId, summary: "Rushes under time pressure." } });

    const subject = await prisma.subject.create({
      data: { userId, name: "Vật lý 12", slug: "vat-ly-12", preferredApiKeyId: apiKey.id },
    });
    const topic = await prisma.topic.create({
      data: { userId, subjectId: subject.id, name: "Dao động cơ", slug: "dao-dong-co" },
    });

    // Base tags are seeded per subject (scopeKey = subjectId); a slug is unique per scope.
    await prisma.adaptiveTag.createMany({
      data: BASE_TAGS.map((t) => ({
        userId,
        subjectId: subject.id,
        scopeKey: tagScopeKey(subject.id),
        name: t.name.VI,
        slug: t.slug,
        i18nKey: t.i18nKey,
        origin: "BASE" as const,
      })),
    });
    await expect(
      prisma.adaptiveTag.create({ data: { userId, subjectId: subject.id, scopeKey: tagScopeKey(subject.id), name: "dup", slug: "calculation" } }),
    ).rejects.toMatchObject({ code: "P2002" });
    // Global-scope uniqueness (NULL subject must not allow duplicates)
    await prisma.adaptiveTag.create({ data: { userId, scopeKey: tagScopeKey(null), name: "Global", slug: "global-tag" } });
    await expect(prisma.adaptiveTag.create({ data: { userId, scopeKey: tagScopeKey(null), name: "dup", slug: "global-tag" } })).rejects.toMatchObject({ code: "P2002" });

    // Card scheduled by the FSRS engine, persisted as-is
    const fsrs = new FSRS({ enableFuzz: false });
    const now = new Date();
    const fresh = createEmptyCard(now);
    const card = await prisma.mistakeCard.create({
      data: {
        userId,
        subjectId: subject.id,
        topicId: topic.id,
        questionLatex: "Tìm chu kỳ $T = 2\\pi\\sqrt{\\frac{l}{g}}$",
        cropBox: { page: 1, x: 0.1, y: 0.2, w: 0.8, h: 0.15 },
        isHighYield: true,
        ...fresh,
      },
    });

    const calcTag = await prisma.adaptiveTag.findFirstOrThrow({ where: { userId, subjectId: subject.id, slug: "calculation" } });
    await prisma.mistakeCardTag.create({ data: { cardId: card.id, tagId: calcTag.id, assignedBy: "AI", confidence: 0.8 } });

    // Attempt 1, Attempt 2 …
    let current = { ...fresh };
    for (const [attemptNumber, rating] of [[1, "AGAIN"], [2, "GOOD"]] as const) {
      const at = new Date(now.getTime() + attemptNumber * 60_000);
      const { card: next, log } = fsrs.next(current, at, rating);
      await prisma.$transaction([
        prisma.mistakeCard.update({ where: { id: card.id }, data: { ...next, attemptCount: attemptNumber } }),
        prisma.cardAttemptLog.create({
          data: { userId, cardId: card.id, attemptNumber, note: `Attempt ${attemptNumber} note`, variantQuestionLatex: attemptNumber === 2 ? "variant" : null, ...log },
        }),
      ]);
      current = next;
    }
    const logs = await prisma.cardAttemptLog.findMany({ where: { cardId: card.id }, orderBy: { attemptNumber: "asc" } });
    expect(logs.map((l) => l.attemptNumber)).toEqual([1, 2]);
    await expect(
      prisma.cardAttemptLog.create({ data: { ...logs[0]!, id: undefined } }),
    ).rejects.toMatchObject({ code: "P2002" });

    // Tag suggestion + rejection with reason
    await prisma.tagSuggestionFeedback.create({
      data: {
        userId,
        subjectId: subject.id,
        kind: "CREATE",
        proposedName: "Quên đổi đơn vị",
        rationale: "Notes mention unit conversion twice.",
        evidenceCardIds: [card.id],
        status: "REJECTED",
        rejectionReason: "too_specific",
        outputLanguage: "VI",
      },
    });

    // Synthesized MIX problem from 2 sources, then promoted into a card
    const second = await prisma.mistakeCard.create({
      data: { userId, subjectId: subject.id, questionLatex: "Con lắc lò xo $\\omega = \\sqrt{k/m}$" },
    });
    const prep = await prisma.examPrepSession.create({
      data: { userId, subjectId: subject.id, title: "Giữa kỳ", topicIds: [topic.id], highYieldOnly: true },
    });
    const problem = await prisma.aiSynthesizedProblem.create({
      data: {
        userId,
        subjectId: subject.id,
        examPrepSessionId: prep.id,
        mode: "MIX",
        questionLatex: "…",
        outputLanguage: "VI",
        aiProvider: "OPENAI",
        aiModel: "test-model",
        promptVersion: "synth-v1",
        apiKeyId: apiKey.id,
        usedHighYield: true,
        verificationLatex: "**Substitution**\n\n$2 + 2 = 4$",
        sources: { create: [{ cardId: card.id, position: 0 }, { cardId: second.id, position: 1 }] },
      },
      include: { sources: true },
    });
    expect(problem.isExperimental).toBe(true);
    expect(problem.revision).toBe(0);
    expect(problem.sources).toHaveLength(2);

    // Cascade: deleting the user removes everything
    await prisma.user.delete({ where: { id: userId } });
    userId = "";
    const counts = await Promise.all([
      prisma.subject.count({ where: { id: subject.id } }),
      prisma.mistakeCard.count({ where: { subjectId: subject.id } }),
      prisma.cardAttemptLog.count({ where: { cardId: card.id } }),
      prisma.adaptiveTag.count({ where: { id: calcTag.id } }),
      prisma.aiSynthesizedProblem.count({ where: { id: problem.id } }),
      prisma.userApiKey.count({ where: { id: apiKey.id } }),
      prisma.account.count({ where: { userId: user.id } }),
      prisma.session.count({ where: { userId: user.id } }),
      prisma.storedFile.count({ where: { userId: user.id } }),
    ]);
    expect(counts).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

/** The security contract: user B can neither read nor change anything user A owns, whatever ids B supplies. */
describe.skipIf(!url)("PrismaRepository data isolation", () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url! }) });
  const repo = new PrismaRepository(prisma);
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ids: string[] = [];

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  const notFound = { code: "NOT_FOUND" };
  const makeUser = async (label: string) => {
    const user = await prisma.user.create({ data: { email: `${label}-${stamp}@vaultlearn.test`, displayName: `Test User ${label}`, passwordHash: "x" } });
    ids.push(user.id);
    return user.id;
  };

  it("keeps two users' data fully separate", async () => {
    const a = await makeUser("a");
    const b = await makeUser("b");

    // User A builds a small vault.
    const subject = await repo.createSubject(a, { name: "Physics" });
    const topic = await repo.createTopic(a, { subjectId: subject.id, name: "Waves" });
    const tags = (await repo.loadSnapshot(a))!.tags.filter((t) => t.subjectId === subject.id);
    expect(tags.map((t) => t.slug).sort()).toEqual(BASE_TAGS.map((t) => t.slug).sort());
    const key = await repo.createApiKey(a, { provider: "OPENAI", label: "Key A", apiKey: "sk-test-aaaaaaaaaaaa", defaultModel: "gpt-4o-mini" });
    const upload = await repo.createUpload(a, {
      title: "Exam", subjectId: subject.id, fileKind: "IMAGE", mimeType: "image/png", fileSizeBytes: 3, pageCount: 1, sha256: `sha-${stamp}`,
      files: [new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })],
    });
    const card = await repo.createCard(a, {
      subjectId: subject.id, topicId: topic.id, examUploadId: upload.id, questionLatex: "", originalCrop: new Blob([new Uint8Array([9, 9])], { type: "image/jpeg" }), tagIds: [tags[0].id],
    });
    const cropPath = card.originalCropPath!;
    expect((await repo.getBlob(a, cropPath))?.mimeType).toBe("image/jpeg");

    // What user A gets back never carries secrets.
    const snapshotA = (await repo.loadSnapshot(a))!;
    expect(snapshotA.cards).toHaveLength(1);
    expect(snapshotA.apiKeys[0]).toMatchObject({ keyHint: "aaaa", label: "Key A" });
    expect(snapshotA.apiKeys[0]).not.toHaveProperty("encryptedKey");
    expect(snapshotA.user).not.toHaveProperty("passwordHash");

    // User B sees nothing of it ...
    const snapshotB = (await repo.loadSnapshot(b))!;
    for (const rows of [snapshotB.subjects, snapshotB.topics, snapshotB.cards, snapshotB.tags, snapshotB.cardTags, snapshotB.examUploads, snapshotB.apiKeys, snapshotB.logs]) expect(rows).toEqual([]);
    expect(await repo.getBlob(b, cropPath)).toBeNull();
    expect(await repo.getApiKeyCredential(b, key.id)).toBeNull();
    expect((await repo.getApiKeyCredential(a, key.id))?.encryptedKey).toMatch(/^v1\./);

    // ... and every write that names A's ids fails as "not found", leaving A's rows untouched.
    await expect(repo.updateSubject(b, subject.id, { name: "Hacked" })).rejects.toMatchObject(notFound);
    await expect(repo.deleteSubject(b, subject.id)).rejects.toMatchObject(notFound);
    await expect(repo.createTopic(b, { subjectId: subject.id, name: "X" })).rejects.toMatchObject(notFound);
    await expect(repo.updateTopic(b, topic.id, { name: "X" })).rejects.toMatchObject(notFound);
    await expect(repo.deleteTopic(b, topic.id)).rejects.toMatchObject(notFound);
    await expect(repo.updateApiKey(b, key.id, { isActive: false })).rejects.toMatchObject(notFound);
    await expect(repo.deleteApiKey(b, key.id)).rejects.toMatchObject(notFound);
    await expect(repo.updateUpload(b, upload.id, { title: "X" })).rejects.toMatchObject(notFound);
    await expect(repo.deleteUpload(b, upload.id)).rejects.toMatchObject(notFound);
    await expect(repo.createCard(b, { subjectId: subject.id, questionLatex: "mine now" })).rejects.toMatchObject(notFound);
    await expect(repo.updateCard(b, card.id, { solutionLatex: "x" })).rejects.toMatchObject(notFound);
    await expect(repo.setCardTags(b, card.id, [])).rejects.toMatchObject(notFound);
    await expect(repo.reviewCard(b, { cardId: card.id, rating: "GOOD", reviewedAt: new Date() })).rejects.toMatchObject(notFound);
    await expect(repo.deleteCard(b, card.id)).rejects.toMatchObject(notFound);
    await expect(repo.saveSubjectMemory(b, subject.id, { memorySummary: "x", memoryInsights: null, source: "edit" })).rejects.toMatchObject(notFound);
    await expect(repo.addTagSuggestions(b, subject.id, [])).rejects.toMatchObject(notFound);
    await expect(repo.createExamPrepSession(b, { subjectId: subject.id, title: "X" })).rejects.toMatchObject(notFound);
    await expect(repo.updateUser("not-a-uuid", { displayName: "x" })).rejects.toBeInstanceOf(RepoError);
    // B cannot attach A's api key to B's own subject either.
    const own = await repo.createSubject(b, { name: "Own" });
    await expect(repo.updateSubject(b, own.id, { preferredApiKeyId: key.id })).rejects.toMatchObject(notFound);

    const after = (await repo.loadSnapshot(a))!;
    expect(after.subjects.map((s) => s.name)).toEqual(["Physics"]);
    expect(after.cards).toHaveLength(1);
    expect(after.apiKeys).toHaveLength(1);
    expect(after.examUploads).toHaveLength(1);

    // A's own flow still works: grade the card, then delete the source (the problem survives it).
    const graded = await repo.reviewCard(a, { cardId: card.id, rating: "GOOD", reviewedAt: new Date() });
    expect(graded.log.attemptNumber).toBe(1);
    await repo.deleteUpload(a, upload.id);
    expect((await repo.loadSnapshot(a))!.cards[0].examUploadId).toBeNull();
    await repo.deleteCard(a, card.id);
    expect(await repo.getBlob(a, cropPath)).toBeNull();
  });
});
