import { describe, expect, it } from "vitest";

import { patchCard, patchUser, removeCard, setCardTagLinks } from "@/lib/optimistic";
import type { UserSnapshot } from "@/lib/repo/types";

const snapshot = {
  user: { id: "u", theme: "LIGHT", uiLanguage: "VI", defaultAiOutputLanguage: "VI" },
  cards: [
    { id: "c1", isHighYield: false, solutionLatex: null },
    { id: "c2", isHighYield: false, solutionLatex: "x" },
  ],
  logs: [
    { id: "l1", cardId: "c1" },
    { id: "l2", cardId: "c2" },
  ],
  cardTags: [
    { cardId: "c1", tagId: "t1", assignedBy: "USER", confidence: null, createdAt: new Date(0) },
    { cardId: "c2", tagId: "t1", assignedBy: "AI", confidence: 0.9, createdAt: new Date(0) },
  ],
} as unknown as UserSnapshot;

describe("optimistic edits", () => {
  it("patches one card and leaves every other object alone", () => {
    const next = patchCard(snapshot, "c1", { isHighYield: true });
    expect(next.cards[0]).toMatchObject({ id: "c1", isHighYield: true });
    expect(next.cards[1]).toBe(snapshot.cards[1]);
    expect(next.logs).toBe(snapshot.logs);
    expect(snapshot.cards[0].isHighYield).toBe(false);
  });

  it("ignores undefined patch values and unknown cards", () => {
    expect(patchCard(snapshot, "c2", { solutionLatex: undefined }).cards[1].solutionLatex).toBe("x");
    expect(patchCard(snapshot, "nope", { isHighYield: true })).toBe(snapshot);
  });

  it("patches the user", () => {
    const next = patchUser(snapshot, { theme: "DARK_GRAY" });
    expect(next.user.theme).toBe("DARK_GRAY");
    expect(next.cards).toBe(snapshot.cards);
  });

  it("adds and removes tag links for one card only, keeping the links that stay", () => {
    const added = setCardTagLinks(snapshot, "c1", ["t1", "t2"], new Date(5));
    expect(added.cardTags).toHaveLength(3);
    expect(added.cardTags[0]).toBe(snapshot.cardTags[0]);
    expect(added.cardTags[1]).toBe(snapshot.cardTags[1]);
    expect(added.cardTags[2]).toMatchObject({ cardId: "c1", tagId: "t2", assignedBy: "USER" });
    const removed = setCardTagLinks(snapshot, "c1", []);
    expect(removed.cardTags).toEqual([snapshot.cardTags[1]]);
    expect(setCardTagLinks(snapshot, "c1", ["t1"])).toBe(snapshot);
  });

  it("removes a card with its logs and tag links", () => {
    const next = removeCard(snapshot, "c1");
    expect(next.cards.map((c) => c.id)).toEqual(["c2"]);
    expect(next.logs.map((l) => l.id)).toEqual(["l2"]);
    expect(next.cardTags.map((l) => l.cardId)).toEqual(["c2"]);
  });
});
