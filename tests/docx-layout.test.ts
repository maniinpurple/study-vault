import { describe, expect, it } from "vitest";

import { PAGE_CONTENT_HEIGHT, paginateBlocks } from "@/lib/docx-layout";

describe("paginateBlocks", () => {
  it("fills pages greedily without ever splitting a block", () => {
    expect(paginateBlocks([300, 300, 300, 300], 700)).toEqual([[0, 1], [2, 3]]);
    expect(paginateBlocks([400, 400, 100], 700)).toEqual([[0], [1, 2]]);
  });
  it("gives a block taller than a page a page of its own", () => {
    expect(paginateBlocks([100, 5000, 100], 700)).toEqual([[0], [1], [2]]);
    expect(paginateBlocks([5000], 700)).toEqual([[0]]);
  });
  it("returns no pages for an empty document and keeps every block exactly once", () => {
    expect(paginateBlocks([])).toEqual([]);
    const heights = Array.from({ length: 40 }, (_, i) => 30 + ((i * 37) % 200));
    const pages = paginateBlocks(heights);
    expect(pages.flat()).toEqual(heights.map((_, i) => i));
    for (const page of pages) if (page.length > 1) expect(page.reduce((sum, i) => sum + heights[i], 0)).toBeLessThanOrEqual(PAGE_CONTENT_HEIGHT);
  });
});
