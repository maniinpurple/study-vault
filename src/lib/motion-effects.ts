/**
 * Geometry and timing for the two signature switches (see `src/components/switch-effects.ts` for the DOM side):
 *  - the circular reveal of the Light / Dark toggle, and
 *  - the shockwave of the VI / EN toggle, which makes text hop one after another as the wave passes. Pure and tested.
 */

export interface Point {
  x: number;
  y: number;
}

/** The circle that, centred on `origin`, just covers the whole viewport: the distance to its farthest corner. */
export function coverRadius(origin: Point, viewport: { width: number; height: number }): number {
  return Math.hypot(Math.max(origin.x, viewport.width - origin.x), Math.max(origin.y, viewport.height - origin.y));
}

export const centerOf = (rect: { left: number; top: number; width: number; height: number }): Point => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });

/** The circular reveal of the mode switch. */
export const REVEAL = { durationMs: 450, easing: "cubic-bezier(0.22, 1, 0.36, 1)" } as const;

/** The language switch: the ring, and how the hop of each text element is timed. */
export const SHOCKWAVE = {
  ringMs: 550,
  /** The ring reaches this many times the viewport's width/height (as a diameter) before it has faded away. */
  ringReach: 2.5,
  /** Delay of the farthest element, so the whole screen has hopped within about spreadMs + hopMs. */
  spreadMs: 320,
  hopMs: 220,
  hopRisePx: 5,
  hopScale: 1.03,
  /** The text swaps this long after the click, as the wave leaves the button. */
  swapAfterMs: 120,
  /** Beyond this many text elements on screen, only the nearest ones hop (the rest just swap). */
  maxElements: 260,
} as const;

/** Delay before an element at `distance` from the click starts its hop: 0 at the button, `spreadMs` at the farthest corner. */
export function waveDelay(distance: number, maxDistance: number, spreadMs: number = SHOCKWAVE.spreadMs): number {
  if (maxDistance <= 0) return 0;
  return Math.round(Math.min(1, Math.max(0, distance / maxDistance)) * spreadMs);
}

/** Hop delay for each element center, nearest first; elements beyond `limit` are dropped. */
export function planWave<T extends Point>(centers: readonly T[], origin: Point, maxDistance: number, limit: number = SHOCKWAVE.maxElements): { item: T; delay: number }[] {
  return centers
    .map((item) => ({ item, distance: Math.hypot(item.x - origin.x, item.y - origin.y) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit)
    .map(({ item, distance }) => ({ item, delay: waveDelay(distance, maxDistance) }));
}
