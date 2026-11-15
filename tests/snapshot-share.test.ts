import { describe, expect, it } from "vitest";

import { shareStructure } from "@/lib/snapshot-share";

const card = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: `Card ${id}`, createdAt: new Date("2026-01-01T00:00:00Z"), tags: ["a"], ...extra });

describe("shareStructure", () => {
  it("returns the previous object when nothing changed, even though every object is a new identity", () => {
    const prev = { user: { id: "u", theme: "LIGHT" }, cards: [card("1"), card("2")] };
    const next = { user: { id: "u", theme: "LIGHT" }, cards: [card("1"), card("2")] };
    expect(shareStructure(prev, next)).toBe(prev);
  });

  it("keeps the identity of every unchanged item and replaces only what changed", () => {
    const prev = { user: { id: "u", theme: "LIGHT" }, cards: [card("1"), card("2"), card("3")] };
    const next = { user: { id: "u", theme: "LIGHT" }, cards: [card("1"), card("2", { title: "Edited" }), card("3")] };
    const shared = shareStructure(prev, next);
    expect(shared).not.toBe(prev);
    expect(shared.user).toBe(prev.user);
    expect(shared.cards[0]).toBe(prev.cards[0]);
    expect(shared.cards[1]).not.toBe(prev.cards[1]);
    expect(shared.cards[1].title).toBe("Edited");
    expect(shared.cards[2]).toBe(prev.cards[2]);
    expect(shared.cards[1].createdAt).toBe(prev.cards[1].createdAt);
  });

  it("matches list items by id, so an insert or removal does not break the items after it", () => {
    const prev = { cards: [card("1"), card("2"), card("3")] };
    const inserted = shareStructure(prev, { cards: [card("0"), card("1"), card("2"), card("3")] });
    expect(inserted.cards).toHaveLength(4);
    expect(inserted.cards.slice(1)).toEqual(prev.cards);
    inserted.cards.slice(1).forEach((item, i) => expect(item).toBe(prev.cards[i]));
    const removed = shareStructure(prev, { cards: [card("1"), card("3")] });
    expect(removed.cards[0]).toBe(prev.cards[0]);
    expect(removed.cards[1]).toBe(prev.cards[2]);
  });

  it("matches link rows (cardId + tagId) by their pair", () => {
    const link = (cardId: string, tagId: string) => ({ cardId, tagId, assignedBy: "USER", confidence: null, createdAt: new Date(0) });
    const prev = { cardTags: [link("c1", "t1"), link("c1", "t2"), link("c2", "t1")] };
    const next = shareStructure(prev, { cardTags: [link("c1", "t2"), link("c2", "t1"), link("c3", "t3")] });
    expect(next.cardTags[0]).toBe(prev.cardTags[1]);
    expect(next.cardTags[1]).toBe(prev.cardTags[2]);
    expect(next.cardTags[2]).toEqual(link("c3", "t3"));
  });

  it("treats dates by value, nested arrays by content, and handles null and primitives", () => {
    const prev = { when: new Date(5), list: [1, 2, 3], none: null as string | null, n: 1 };
    expect(shareStructure(prev, { when: new Date(5), list: [1, 2, 3], none: null, n: 1 })).toBe(prev);
    const changed = shareStructure(prev, { when: new Date(6), list: [1, 2, 3], none: null, n: 1 });
    expect(changed.when.getTime()).toBe(6);
    expect(changed.list).toBe(prev.list);
    expect(shareStructure(undefined, { a: 1 })).toEqual({ a: 1 });
    expect(shareStructure({ a: 1 }, null)).toBeNull();
  });

  it("never mutates its inputs", () => {
    const prev = { cards: [card("1")] };
    const next = { cards: [card("1", { title: "X" })] };
    const before = JSON.stringify([prev, next]);
    shareStructure(prev, next);
    expect(JSON.stringify([prev, next])).toBe(before);
  });
});
