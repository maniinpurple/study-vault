/**
 * Database integration test — runs only when TEST_DATABASE_URL points at a disposable, migrated Postgres:
 *
 *   npx prisma dev -n vaultlearn-test -d                       # or any throwaway Postgres
 *   DATABASE_URL=<url> npx prisma migrate deploy
 *   TEST_DATABASE_URL=<url> npm test
 *
 * Every row it creates hangs off one test user and is removed via cascade at the end.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { BASE_TAGS, tagScopeKey } from "@/lib/constants";
import { apiKeyContext, createVault, generateMasterKey } from "@/lib/crypto";
import { FSRS, createEmptyCard } from "@/lib/fsrs";

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
    ]);
    expect(counts).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
