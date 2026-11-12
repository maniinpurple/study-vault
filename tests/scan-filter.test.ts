import { describe, expect, it } from "vitest";

import { applyDocumentScan } from "@/lib/scan-filter";

/** Paper (value `paper`) with a horizontal shadow gradient and a dark "text" bar. */
function shadowedPage(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  const textRows = new Set([30, 31, 32, 33]);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const shade = 0.35 + 0.65 * (x / (width - 1)); // left side is in deep shadow
      const isInk = textRows.has(y) && x > 10 && x < width - 10;
      const v = Math.round((isInk ? 40 : 235) * shade);
      const i = (y * width + x) * 4;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

const px = (data: Uint8ClampedArray, width: number, x: number, y: number) => data[(y * width + x) * 4];

describe("applyDocumentScan", () => {
  const width = 160;
  const height = 80;

  it("flattens shadows so paper is uniformly white while ink stays dark", () => {
    const data = shadowedPage(width, height);
    expect(px(data, width, 5, 60)).toBeLessThan(110); // shadowed paper starts dark…
    applyDocumentScan(data, width, height);
    expect(px(data, width, 5, 60)).toBeGreaterThan(235); // …and ends white
    expect(px(data, width, 150, 60)).toBeGreaterThan(235);
    expect(px(data, width, 40, 31)).toBeLessThan(90); // shadowed ink
    expect(px(data, width, 140, 31)).toBeLessThan(90); // lit ink
  });

  it("outputs neutral gray and leaves alpha untouched", () => {
    const data = shadowedPage(width, height);
    applyDocumentScan(data, width, height);
    for (let i = 0; i < data.length; i += 4) {
      expect(data[i]).toBe(data[i + 1]);
      expect(data[i]).toBe(data[i + 2]);
      expect(data[i + 3]).toBe(255);
    }
  });

  it("ignores degenerate input", () => {
    const tiny = new Uint8ClampedArray(4).fill(100);
    applyDocumentScan(tiny, 0, 0);
    expect(Array.from(tiny)).toEqual([100, 100, 100, 100]);
    applyDocumentScan(tiny, 1, 1);
    expect(tiny[3]).toBe(100);
  });
});
