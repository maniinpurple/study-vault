/**
 * Stitching a question that is split across pages: the regions are cropped, scaled to one width and stacked vertically
 * into a single image. Pure layout maths (the canvas drawing lives in `scan-source.ts`), so it is unit-tested.
 */
import type { CropRegion } from "@/lib/repo/types";

export interface PartSize {
  width: number;
  height: number;
}

/** A question rarely spans more than a couple of pages; this caps the work and the stored image. */
export const MAX_STITCH_PARTS = 6;
/** White space between stacked parts, in pixels of the stitched image. */
export const STITCH_GAP = 12;
/** Longest edge of the stitched image. Larger stacks are scaled down together. */
export const MAX_STITCH_EDGE = 6000;

export interface StitchLayout {
  width: number;
  height: number;
  /** Where each part lands (same order as the input), already scaled to the common width. */
  placements: { y: number; width: number; height: number }[];
}

/** Common width = the widest part; every part is scaled to it (keeping its aspect ratio) and stacked top to bottom. */
export function stitchLayout(parts: readonly PartSize[], gap = STITCH_GAP, maxEdge = MAX_STITCH_EDGE): StitchLayout {
  const usable = parts.filter((p) => p.width > 0 && p.height > 0);
  if (usable.length === 0) return { width: 1, height: 1, placements: [] };
  const width = Math.max(...usable.map((p) => p.width));
  const scaled = usable.map((p) => ({ width, height: (p.height * width) / p.width }));
  const totalHeight = scaled.reduce((sum, p) => sum + p.height, 0) + gap * (scaled.length - 1);
  const shrink = Math.min(1, maxEdge / Math.max(width, totalHeight));
  let y = 0;
  const placements = scaled.map((p) => {
    const placement = { y: Math.round(y), width: Math.max(1, Math.round(p.width * shrink)), height: Math.max(1, Math.round(p.height * shrink)) };
    y += (p.height + gap) * shrink;
    return placement;
  });
  const last = placements[placements.length - 1];
  return { width: Math.max(1, Math.round(width * shrink)), height: last.y + last.height, placements };
}

/** Reading order for regions picked in any order: by page, then top to bottom, then left to right. */
export function sortRegions<T extends CropRegion>(regions: readonly T[]): T[] {
  return [...regions].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
}
