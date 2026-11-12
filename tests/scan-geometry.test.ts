import { describe, expect, it } from "vitest";

import { boxFromPoints, clampBox, containsPoint, fitLongEdge, isUsableBox, MIN_BOX, moveBox, overlapRatio, resizeBox, toNormPoint, toPixelRect } from "@/lib/scan-geometry";

describe("pointer → normalised geometry", () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 };
  it("normalises and clamps to the page", () => {
    expect(toNormPoint(300, 150, rect)).toEqual({ x: 0.5, y: 0.5 });
    expect(toNormPoint(-20, 9999, rect)).toEqual({ x: 0, y: 1 });
    expect(toNormPoint(10, 10, { ...rect, width: 0 })).toEqual({ x: 0, y: 0 });
  });
  it("builds a box from two corners in any drag direction", () => {
    const a = { x: 0.6, y: 0.7 };
    const b = { x: 0.2, y: 0.1 };
    expect(boxFromPoints(a, b)).toEqual({ x: 0.2, y: 0.1, w: expect.closeTo(0.4, 10), h: expect.closeTo(0.6, 10) });
    expect(boxFromPoints(b, a)).toEqual(boxFromPoints(a, b));
  });
  it("rejects stray clicks", () => {
    expect(isUsableBox({ x: 0.1, y: 0.1, w: MIN_BOX / 2, h: 0.3 })).toBe(false);
    expect(isUsableBox({ x: 0.1, y: 0.1, w: 0.1, h: 0.1 })).toBe(true);
  });
});

describe("move / resize", () => {
  const box = { x: 0.2, y: 0.2, w: 0.4, h: 0.3 };
  it("moves without leaving the page or changing size", () => {
    expect(moveBox(box, 0.9, 0.9)).toEqual({ x: 0.6, y: 0.7, w: 0.4, h: 0.3 });
    expect(moveBox(box, -1, -1)).toEqual({ x: 0, y: 0, w: 0.4, h: 0.3 });
  });
  it("clamps oversize boxes", () => {
    expect(clampBox({ x: 0.5, y: 0.5, w: 2, h: 2 })).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
  it("resizes from a corner keeping the opposite corner fixed", () => {
    const next = resizeBox(box, "se", { x: 0.9, y: 0.8 });
    expect(next).toEqual({ x: 0.2, y: 0.2, w: expect.closeTo(0.7, 10), h: expect.closeTo(0.6, 10) });
    const nw = resizeBox(box, "nw", { x: 0.1, y: 0.05 });
    expect(nw.x + nw.w).toBeCloseTo(0.6, 10);
    expect(nw.y + nw.h).toBeCloseTo(0.5, 10);
  });
  it("never inverts or shrinks below the minimum, and edge handles move one axis", () => {
    const squeezed = resizeBox(box, "e", { x: 0.1, y: 0.9 });
    expect(squeezed.w).toBeCloseTo(MIN_BOX, 10);
    expect(squeezed.h).toBe(box.h);
    expect(resizeBox(box, "n", { x: 0, y: 2 }).h).toBeCloseTo(MIN_BOX, 10);
  });
});

describe("hit-testing and overlap", () => {
  it("detects points and containment", () => {
    const box = { x: 0.1, y: 0.1, w: 0.2, h: 0.2 };
    expect(containsPoint(box, { x: 0.2, y: 0.2 })).toBe(true);
    expect(containsPoint(box, { x: 0.5, y: 0.2 })).toBe(false);
    expect(overlapRatio({ x: 0.1, y: 0.1, w: 0.1, h: 0.1 }, box)).toBe(1);
    expect(overlapRatio({ x: 0.25, y: 0.1, w: 0.1, h: 0.1 }, box)).toBeCloseTo(0.5, 10);
    expect(overlapRatio({ x: 0.8, y: 0.8, w: 0.1, h: 0.1 }, box)).toBe(0);
  });
});

describe("pixel mapping", () => {
  it("maps to integer rects inside the bitmap", () => {
    expect(toPixelRect({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, 1000, 800)).toEqual({ sx: 250, sy: 400, sw: 500, sh: 200 });
    const edge = toPixelRect({ x: 0.999, y: 0.999, w: 0.5, h: 0.5 }, 100, 100);
    expect(edge.sx + edge.sw).toBeLessThanOrEqual(100);
    expect(edge.sy + edge.sh).toBeLessThanOrEqual(100);
    expect(edge.sw).toBeGreaterThanOrEqual(1);
  });
  it("fits the long edge without upscaling", () => {
    expect(fitLongEdge(4000, 2000, 2000)).toEqual({ width: 2000, height: 1000, scale: 0.5 });
    expect(fitLongEdge(800, 600, 2000)).toEqual({ width: 800, height: 600, scale: 1 });
  });
});
