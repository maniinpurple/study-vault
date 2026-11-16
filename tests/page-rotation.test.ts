import { describe, expect, it } from "vitest";

import { normalizeTurns, parseRotations, rotatedPage, rotateBox, serializeRotations, unrotateBox } from "@/lib/page-rotation";

const close = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => {
  for (const key of ["x", "y", "w", "h"] as const) expect(a[key]).toBeCloseTo(b[key], 10);
};

describe("rotateBox", () => {
  const box = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };

  it("turns a region a quarter clockwise: the top-left corner of the page goes to the top-right", () => {
    // A box in the page's top-left corner ends up in the top-right corner after a clockwise quarter turn.
    close(rotateBox({ x: 0, y: 0, w: 0.2, h: 0.1 }, 1), { x: 0.9, y: 0, w: 0.1, h: 0.2 });
    // …and one in the bottom-left corner goes to the top-left.
    close(rotateBox({ x: 0, y: 0.9, w: 0.2, h: 0.1 }, 1), { x: 0, y: 0, w: 0.1, h: 0.2 });
  });

  it("four quarter turns bring every box back", () => {
    close(rotateBox(box, 4), box);
    let turned = box;
    for (let i = 0; i < 4; i++) turned = rotateBox(turned, 1);
    close(turned, box);
  });

  it("a half turn mirrors both axes", () => {
    close(rotateBox(box, 2), { x: 1 - 0.1 - 0.3, y: 1 - 0.2 - 0.4, w: 0.3, h: 0.4 });
  });

  it("unrotateBox is the inverse for every number of turns", () => {
    for (const turns of [0, 1, 2, 3, 5, -1]) close(unrotateBox(rotateBox(box, turns), turns), box);
  });

  it("keeps the box inside the page and swaps its size on odd turns", () => {
    const turned = rotateBox(box, 1);
    expect(turned.w).toBeCloseTo(box.h);
    expect(turned.h).toBeCloseTo(box.w);
    expect(turned.x).toBeGreaterThanOrEqual(0);
    expect(turned.x + turned.w).toBeLessThanOrEqual(1 + 1e-12);
  });
});

describe("rotation bookkeeping", () => {
  it("normalizes any integer to 0–3", () => {
    expect([0, 1, 4, 5, -1, -4, 7].map(normalizeTurns)).toEqual([0, 1, 0, 1, 3, 0, 3]);
  });

  it("adds a quarter turn per page and drops a page that is back at 0", () => {
    let rotations = rotatedPage({}, 2);
    expect(rotations).toEqual({ 2: 1 });
    rotations = rotatedPage(rotatedPage(rotatedPage(rotations, 2), 2), 2);
    expect(rotations).toEqual({});
    expect(rotatedPage({ 1: 3 }, 2)).toEqual({ 1: 3, 2: 1 });
  });

  it("round-trips through storage and ignores malformed data", () => {
    expect(parseRotations(serializeRotations({ 1: 1, 4: 3 }))).toEqual({ 1: 1, 4: 3 });
    expect(parseRotations(null)).toEqual({});
    expect(parseRotations("not json")).toEqual({});
    expect(parseRotations("[1,2]")).toEqual({});
    expect(parseRotations('{"1":4,"0":1,"x":1,"2":"1","3":2}')).toEqual({ 3: 2 });
  });
});
