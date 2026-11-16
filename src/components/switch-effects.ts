"use client";

/**
 * The DOM side of the two signature switches (geometry and timing are in `src/lib/motion-effects.ts`).
 *
 *  - `playModeSwitch`: Light / Dark. A circular clip-path grows from the clicked button and reveals the new mode, using the View
 *    Transitions API. Without it (or with reduced motion) the mode simply changes.
 *  - `playLanguageSwitch`: VI / EN. A ring spreads from the clicked button and text elements hop as it passes, one after another by
 *    distance; the language itself changes just after the click, so the new text appears under the wave.
 *
 * Both are cosmetic wrappers: the state change is a callback that runs exactly once, whatever happens to the animation.
 * Nothing here wraps characters in spans, so React's DOM and KaTeX output are never touched.
 */
import { centerOf, coverRadius, planWave, REVEAL, SHOCKWAVE, type Point } from "@/lib/motion-effects";

/** A click's origin: the clicked element's center, or an explicit point. */
export type SwitchOrigin = Element | Point | null | undefined;

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function resolveOrigin(origin: SwitchOrigin): Point {
  if (origin instanceof Element) return centerOf(origin.getBoundingClientRect());
  if (origin) return origin;
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

type ViewTransitionDocument = Document & { startViewTransition?: (update: () => void | Promise<void>) => { ready: Promise<void>; finished: Promise<void> } };

/**
 * Run `update` (which must switch the mode in the DOM synchronously, e.g. set `data-mode`) inside a circular reveal from `origin`.
 * While the transition runs, CSS transitions are switched off (`html.vl-switching`) so nothing animates twice.
 */
export function playModeSwitch(origin: SwitchOrigin, update: () => void): void {
  const doc = document as ViewTransitionDocument;
  if (prefersReducedMotion() || typeof doc.startViewTransition !== "function") return update();

  const { x, y } = resolveOrigin(origin);
  const radius = coverRadius({ x, y }, { width: window.innerWidth, height: window.innerHeight });
  const root = document.documentElement;
  root.classList.add("vl-switching");
  let transition: ReturnType<NonNullable<ViewTransitionDocument["startViewTransition"]>>;
  try {
    transition = doc.startViewTransition(update);
  } catch {
    root.classList.remove("vl-switching");
    return update();
  }
  void transition.ready
    .then(() => {
      root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] }, { duration: REVEAL.durationMs, easing: REVEAL.easing, pseudoElement: "::view-transition-new(root)" });
    })
    // `ready` rejects when the transition is skipped; the update has still run.
    .catch(() => undefined);
  void transition.finished.catch(() => undefined).finally(() => root.classList.remove("vl-switching"));
}

const BOUNCE_TARGETS = "h1, h2, h3, p, button, a, label, th, td, [data-i18n]";

/** Visible text-bearing leaf elements: not formulas, not containers of other targets, not inline boxes (transforms ignore those). */
function collectTextElements(): { el: HTMLElement; x: number; y: number }[] {
  const found: { el: HTMLElement; x: number; y: number }[] = [];
  const width = window.innerWidth;
  const height = window.innerHeight;
  for (const el of document.querySelectorAll<HTMLElement>(BOUNCE_TARGETS)) {
    if (el.closest(".katex, [aria-hidden='true'], [data-no-wave]") || !el.textContent?.trim() || el.querySelector(BOUNCE_TARGETS)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || rect.bottom < 0 || rect.top > height || rect.right < 0 || rect.left > width) continue;
    if (getComputedStyle(el).display === "inline") continue;
    found.push({ el, ...centerOf(rect) });
  }
  return found;
}

function spawnRing({ x, y }: Point) {
  const ring = document.createElement("div");
  // `contain` keeps the growing ring from laying out anything else; the border stays a crisp 2px at every size.
  ring.className = "pointer-events-none fixed z-[80] rounded-full border-2 border-primary/40";
  Object.assign(ring.style, { left: `${x}px`, top: `${y}px`, width: "0px", height: "0px", transform: "translate(-50%, -50%)", contain: "layout paint style", willChange: "width, height, opacity" });
  ring.setAttribute("aria-hidden", "true");
  document.body.appendChild(ring);
  const diameter = Math.max(window.innerWidth, window.innerHeight) * SHOCKWAVE.ringReach;
  const animation = ring.animate([{ width: "0px", height: "0px", opacity: 0.9 }, { width: `${diameter}px`, height: `${diameter}px`, opacity: 0 }], { duration: SHOCKWAVE.ringMs, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "forwards" });
  const remove = () => ring.remove();
  animation.addEventListener("finish", remove);
  animation.addEventListener("cancel", remove);
}

/**
 * Switch the language with a shockwave from `origin`: a ring spreads over the viewport and every visible text element hops once,
 * delayed by its distance from the click. `update` (the real language change) runs `swapAfterMs` in, once.
 */
export function playLanguageSwitch(origin: SwitchOrigin, update: () => void): void {
  if (prefersReducedMotion()) return update();

  const point = resolveOrigin(origin);
  const maxDistance = coverRadius(point, { width: window.innerWidth, height: window.innerHeight });
  // All layout reads first, then all writes: no layout thrash.
  const plan = planWave(collectTextElements(), point, maxDistance);
  spawnRing(point);
  for (const { item, delay } of plan) {
    item.el.animate(
      [
        { transform: "translateY(0) scale(1)" },
        { transform: `translateY(-${SHOCKWAVE.hopRisePx}px) scale(${SHOCKWAVE.hopScale})`, offset: 0.4 },
        { transform: "translateY(0) scale(1)" },
      ],
      { duration: SHOCKWAVE.hopMs, delay, easing: "ease-out" },
    );
  }
  window.setTimeout(update, SHOCKWAVE.swapAfterMs);
}
