/**
 * Page layout for Word documents. A .docx is converted to HTML, laid out in A4-sized pages and rasterised, so the
 * snip tool treats it exactly like a PDF or photos. Pure maths, unit-tested; the DOM work is in `docx-source.ts`.
 */

/** A4 at 96 dpi. */
export const PAGE_WIDTH = 794;
export const PAGE_HEIGHT = 1123;
export const PAGE_PADDING_X = 64;
export const PAGE_PADDING_Y = 64;
/** Vertical room for content on one page. */
export const PAGE_CONTENT_HEIGHT = PAGE_HEIGHT - 2 * PAGE_PADDING_Y;
export const PAGE_CONTENT_WIDTH = PAGE_WIDTH - 2 * PAGE_PADDING_X;
/** Raster scale: 2 gives ~190 dpi, sharp enough to read fine print after cropping. */
export const RASTER_SCALE = 2;
/** More than this is almost certainly not an exam, and rendering would take minutes. */
export const MAX_DOCX_PAGES = 80;

/**
 * Greedy pagination: blocks (paragraphs, tables, figures) are never split, so a line is never cut in half. A block starts
 * a new page when it does not fit on the current one; a block taller than a page gets a page of its own (and is clipped).
 * Returns the block indices of each page, in order.
 */
export function paginateBlocks(heights: readonly number[], pageHeight = PAGE_CONTENT_HEIGHT): number[][] {
  const pages: number[][] = [];
  let current: number[] = [];
  let used = 0;
  heights.forEach((height, index) => {
    const h = Math.max(0, height);
    if (current.length > 0 && used + h > pageHeight) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(index);
    used += h;
  });
  if (current.length > 0) pages.push(current);
  return pages;
}
