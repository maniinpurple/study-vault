/**
 * Pure box geometry for the exam scanner. All boxes are normalised to the page (0–1, origin top-left), so they are
 * independent of zoom, device pixel ratio and render resolution.
 */

export interface NormBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
export const HANDLES: readonly Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

/** Smallest box edge (fraction of the page) that counts as a deliberate selection rather than a stray click. */
export const MIN_BOX = 0.02;

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/** Convert a pointer position to a normalised point inside `rect` (clamped to the page). */
export function toNormPoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): Point {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return { x: clamp((clientX - rect.left) / rect.width, 0, 1), y: clamp((clientY - rect.top) / rect.height, 0, 1) };
}

/** Box spanned by two corner points, in any drag direction. */
export function boxFromPoints(a: Point, b: Point): NormBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function isUsableBox(box: NormBox, min = MIN_BOX): boolean {
  return box.w >= min && box.h >= min;
}

/** Keep a box fully inside the page without changing its size (when it fits). */
export function clampBox(box: NormBox): NormBox {
  const w = clamp(box.w, 0, 1);
  const h = clamp(box.h, 0, 1);
  return { x: clamp(box.x, 0, 1 - w), y: clamp(box.y, 0, 1 - h), w, h };
}

export function moveBox(origin: NormBox, dx: number, dy: number): NormBox {
  return clampBox({ ...origin, x: origin.x + dx, y: origin.y + dy });
}

/** Resize by dragging `handle` to the absolute page point `to`; the opposite edges stay put and `min` is respected. */
export function resizeBox(origin: NormBox, handle: Handle, to: Point, min = MIN_BOX): NormBox {
  let left = origin.x;
  let top = origin.y;
  let right = origin.x + origin.w;
  let bottom = origin.y + origin.h;
  if (handle.includes("w")) left = clamp(to.x, 0, right - min);
  if (handle.includes("e")) right = clamp(to.x, left + min, 1);
  if (handle.includes("n")) top = clamp(to.y, 0, bottom - min);
  if (handle.includes("s")) bottom = clamp(to.y, top + min, 1);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

export function containsPoint(box: NormBox, p: Point): boolean {
  return p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
}

/** Fraction of `inner`'s area that lies inside `outer` (0–1). */
export function overlapRatio(inner: NormBox, outer: NormBox): number {
  const w = Math.min(inner.x + inner.w, outer.x + outer.w) - Math.max(inner.x, outer.x);
  const h = Math.min(inner.y + inner.h, outer.y + outer.h) - Math.max(inner.y, outer.y);
  const area = inner.w * inner.h;
  return w > 0 && h > 0 && area > 0 ? (w * h) / area : 0;
}

export interface PixelRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** Normalised box → integer pixel rectangle on a `width`×`height` bitmap (at least 1px, never out of bounds). */
export function toPixelRect(box: NormBox, width: number, height: number): PixelRect {
  const sx = clamp(Math.round(box.x * width), 0, Math.max(0, width - 1));
  const sy = clamp(Math.round(box.y * height), 0, Math.max(0, height - 1));
  const sw = clamp(Math.round((box.x + box.w) * width) - sx, 1, width - sx);
  const sh = clamp(Math.round((box.y + box.h) * height) - sy, 1, height - sy);
  return { sx, sy, sw, sh };
}

/** Scale `(w, h)` so the long edge is at most `maxLongEdge`; never upscales. */
export function fitLongEdge(w: number, h: number, maxLongEdge: number): { width: number; height: number; scale: number } {
  const scale = Math.min(1, maxLongEdge / Math.max(w, h, 1));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale };
}
