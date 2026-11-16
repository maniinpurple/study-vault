/**
 * Page rotation for the document viewer. A page is rotated by drawing it into a new off-screen canvas (never with a CSS
 * transform, which would put the pointer and the picture in different coordinate systems and break drag-to-crop).
 *
 * Snips are stored in the page's ORIGINAL orientation (normalized 0–1, as always). The viewer rotates them for display with
 * `rotateBox` and turns a freshly drawn box back with `unrotateBox`, so rotating a page never changes any saved data.
 * Pure, except `rotateCanvas`.
 */
import type { NormBox } from "@/lib/scan-geometry";

/** Quarter turns clockwise. */
export type Turns = 0 | 1 | 2 | 3;

export const normalizeTurns = (value: number): Turns => ((((Math.round(value) % 4) + 4) % 4) as Turns);

/** A box in the original page → the same region on the page turned `turns` quarter turns clockwise. */
export function rotateBox(box: NormBox, turns: number): NormBox {
  let { x, y, w, h } = box;
  for (let i = normalizeTurns(turns); i > 0; i--) [x, y, w, h] = [1 - y - h, x, h, w];
  return { x, y, w, h };
}

/** The inverse of `rotateBox`: a box drawn on the turned page → its place on the original page. */
export function unrotateBox(box: NormBox, turns: number): NormBox {
  return rotateBox(box, 4 - normalizeTurns(turns));
}

/** A copy of `source` turned `turns` quarter turns clockwise (the source is returned as is for 0). */
export function rotateCanvas(source: HTMLCanvasElement, turns: number): HTMLCanvasElement {
  const t = normalizeTurns(turns);
  if (t === 0) return source;
  const out = document.createElement("canvas");
  const sideways = t % 2 === 1;
  out.width = sideways ? source.height : source.width;
  out.height = sideways ? source.width : source.height;
  const ctx = out.getContext("2d");
  if (!ctx) return source;
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((t * Math.PI) / 2);
  ctx.drawImage(source, -source.width / 2, -source.height / 2);
  return out;
}

/** Rotation of each page (1-based) of one document, as kept in localStorage. Pages at 0 are omitted. */
export type PageRotations = Readonly<Record<number, Turns>>;

export const rotationStorageKey = (sourceId: string) => `vl:rotation:${sourceId}`;

/** Parse what `serializeRotations` wrote; anything malformed is ignored rather than trusted. */
export function parseRotations(raw: string | null): PageRotations {
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
    const out: Record<number, Turns> = {};
    for (const [page, turns] of Object.entries(data)) {
      const n = Number(page);
      if (Number.isInteger(n) && n >= 1 && n <= 1000 && typeof turns === "number" && normalizeTurns(turns) !== 0) out[n] = normalizeTurns(turns);
    }
    return out;
  } catch {
    return {};
  }
}

export const serializeRotations = (rotations: PageRotations): string => JSON.stringify(rotations);

/** `rotations` with `page` turned one more quarter clockwise. */
export function rotatedPage(rotations: PageRotations, page: number): PageRotations {
  const next = { ...rotations, [page]: normalizeTurns((rotations[page] ?? 0) + 1) };
  if (next[page] === 0) delete next[page];
  return next;
}
