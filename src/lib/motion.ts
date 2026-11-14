/**
 * Motion presets (DESIGN_SYSTEM.md §5). Springs are described the way Apple's spring API describes them — a duration
 * and a bounce — and keep their velocity when interrupted. Import these instead of writing ad-hoc transitions.
 */
import type { Transition } from "framer-motion";

export const spring = {
  /** Hover/press feedback, tab and nav indicators, toggles. */
  snappy: { type: "spring", duration: 0.26, bounce: 0 },
  /** Panels, sheets, sidebar collapse, list reflow. */
  smooth: { type: "spring", duration: 0.42, bounce: 0 },
  /** One hero moment per flow: a snip landing in the tray, a graded card leaving. */
  lively: { type: "spring", duration: 0.5, bounce: 0.16 },
} as const satisfies Record<string, Transition>;

/** Opacity-only changes and backdrops. */
export const fade = { duration: 0.16, ease: [0.2, 0, 0, 1] } as const satisfies Transition;

/** Standard entrance for a block of content: 8px of travel, never more than 12. */
export const enter = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: spring.smooth,
} as const;

/** Stagger children of a list by a few frames (cap the index so long lists do not crawl in). */
export function staggerDelay(index: number, step = 0.03, max = 8): number {
  return Math.min(index, max) * step;
}
