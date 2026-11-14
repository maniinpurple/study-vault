import { describe, expect, it } from "vitest";

import { cropRegions } from "@/lib/problems";
import { sortRegions, stitchLayout } from "@/lib/stitch";

describe("stitchLayout", () => {
  it("stacks parts at the widest width with a gap, keeping aspect ratios", () => {
    const layout = stitchLayout([{ width: 1000, height: 400 }, { width: 500, height: 100 }], 10);
    // The narrower part is scaled 2x: 500x100 → 1000x200.
    expect(layout.width).toBe(1000);
    expect(layout.placements).toEqual([{ y: 0, width: 1000, height: 400 }, { y: 410, width: 1000, height: 200 }]);
    expect(layout.height).toBe(610);
  });
  it("scales everything down together when the stack is too tall", () => {
    const layout = stitchLayout([{ width: 1000, height: 6000 }, { width: 1000, height: 6000 }], 0, 6000);
    expect(Math.max(layout.width, layout.height)).toBeLessThanOrEqual(6000);
    expect(layout.placements[0].width / layout.placements[0].height).toBeCloseTo(1000 / 6000, 2);
  });
  it("handles a single part and no parts", () => {
    expect(stitchLayout([{ width: 300, height: 200 }]).placements).toEqual([{ y: 0, width: 300, height: 200 }]);
    expect(stitchLayout([]).placements).toEqual([]);
  });
});

describe("regions", () => {
  it("sorts by page, then top to bottom, then left to right", () => {
    const sorted = sortRegions([
      { page: 2, x: 0, y: 0.1, w: 1, h: 0.2 },
      { page: 1, x: 0, y: 0.7, w: 1, h: 0.3 },
      { page: 1, x: 0.5, y: 0.1, w: 0.4, h: 0.1 },
      { page: 1, x: 0.1, y: 0.1, w: 0.3, h: 0.1 },
    ]);
    expect(sorted.map((r) => [r.page, r.y, r.x])).toEqual([[1, 0.1, 0.1], [1, 0.1, 0.5], [1, 0.7, 0], [2, 0.1, 0]]);
  });
  it("lists a problem's regions, first region first", () => {
    const first = { page: 1, x: 0, y: 0.6, w: 1, h: 0.4 };
    const next = { page: 2, x: 0, y: 0, w: 1, h: 0.3 };
    expect(cropRegions({ cropBox: { ...first, more: [next] } })).toEqual([first, next]);
    expect(cropRegions({ cropBox: first })).toEqual([first]);
    expect(cropRegions({ cropBox: null })).toEqual([]);
  });
});
