"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { boxFromPoints, isUsableBox, toNormPoint, type NormBox, type Point } from "@/lib/scan-geometry";
import { rotateCanvas, type Turns } from "@/lib/page-rotation";
import type { ScanDocument } from "@/lib/scan-source";
import { cn } from "@/lib/utils";

export interface PageSnip {
  id: string;
  number: number;
  box: NormBox;
}

/** A region drawn but not saved yet. */
export interface PendingRegion {
  key: string;
  /** 1-based position in the stitched image. */
  number: number;
  box: NormBox;
  /** The most recently drawn region: the one that carries the floating toolbar. */
  newest: boolean;
}

/** The floating toolbar beside the newest pending region. */
export interface RegionToolbar {
  saveLabel: string;
  deleteLabel: string;
  onSave(): void;
  onDelete(): void;
}

export interface SourcePageProps {
  doc: ScanDocument;
  page: number;
  /** Quarter turns clockwise the page is shown at. Snips and pending regions arrive already in this orientation. */
  rotation: Turns;
  /** The clipping viewport, used as the lazy-render root. */
  scrollRoot: React.RefObject<HTMLElement | null>;
  snips: PageSnip[];
  /** Regions drawn on this page and not saved yet. */
  pending: PendingRegion[];
  toolbar: RegionToolbar;
  selectedId: string | null;
  /** Snip mode captures drags; otherwise the page only scrolls and snips are tappable. */
  snipMode: boolean;
  /** Must be a stable object: the page is memoized, and a new `labels` every render would defeat that. */
  labels: { page: (page: number) => string; snip: (n: number) => string; part: (n: number, page: number) => string; rendering: string; failed: string };
  onSnip(page: number, box: NormBox): void;
  onSelect(id: string): void;
}

const pct = (n: number) => `${n * 100}%`;

const show = (el: HTMLElement | null, box: NormBox) => {
  if (!el) return;
  const { style } = el;
  style.display = "block";
  style.left = pct(box.x);
  style.top = pct(box.y);
  style.width = pct(box.w);
  style.height = pct(box.h);
};
const hide = (...els: (HTMLElement | null)[]) => els.forEach((el) => el && (el.style.display = "none"));

/**
 * One exam page: lazily rendered bitmap, highlighter marks for saved snips, and the drag-to-snip selection.
 *
 * Performance: the drag rectangle and the crosshair guides are never React state. A pointer move is coalesced to one update per
 * animation frame and written straight to those elements' `style`, so dragging re-renders nothing. React only hears about the
 * drag once, on release (`onSnip`). The component is memoized: it re-renders only when its own page's snips, pending regions or
 * selection change, never because another page or the tray did.
 */
export const SourcePage = React.memo(SourcePageView, samePageProps);

/** The props are compared by content for the region lists (they are rebuilt whenever any card changes) and by identity otherwise. */
export function samePageProps(a: SourcePageProps, b: SourcePageProps): boolean {
  const sameBox = (x: NormBox, y: NormBox) => x.x === y.x && x.y === y.y && x.w === y.w && x.h === y.h;
  const sameSnips = a.snips.length === b.snips.length && a.snips.every((snip, i) => snip.id === b.snips[i].id && snip.number === b.snips[i].number && sameBox(snip.box, b.snips[i].box));
  const samePending = a.pending.length === b.pending.length && a.pending.every((part, i) => part.key === b.pending[i].key && part.number === b.pending[i].number && part.newest === b.pending[i].newest && sameBox(part.box, b.pending[i].box));
  // The selection only matters to the page that has the selected snip (before or after the change).
  const onPage = (p: SourcePageProps) => p.selectedId !== null && p.snips.some((snip) => snip.id === p.selectedId);
  const sameSelection = !(onPage(a) || onPage(b)) || a.selectedId === b.selectedId;
  return (
    sameSnips && samePending && sameSelection &&
    a.doc === b.doc && a.page === b.page && a.rotation === b.rotation && a.scrollRoot === b.scrollRoot && a.toolbar === b.toolbar && a.snipMode === b.snipMode && a.labels === b.labels && a.onSnip === b.onSnip && a.onSelect === b.onSelect
  );
}

function SourcePageView({ doc, page, rotation, scrollRoot, snips, pending, toolbar, selectedId, snipMode, labels, onSnip, onSelect }: SourcePageProps) {
  const frameRef = React.useRef<HTMLDivElement>(null);
  const holderRef = React.useRef<HTMLDivElement>(null);
  const [near, setNear] = React.useState(false);
  const [aspect, setAspect] = React.useState(1 / Math.SQRT2);
  const [status, setStatus] = React.useState<"idle" | "ready" | "failed">("idle");
  const selectionRef = React.useRef<HTMLDivElement>(null);
  const guideXRef = React.useRef<HTMLSpanElement>(null);
  const guideYRef = React.useRef<HTMLSpanElement>(null);
  /** The drag in progress: where it started and the page's rectangle at that moment (panning is off while snipping). */
  const dragRef = React.useRef<{ start: Point; rect: DOMRect } | null>(null);
  const latest = React.useRef({ snipMode, status: "idle" as "idle" | "ready" | "failed" });

  // Render only pages near the viewport; a full-resolution page bitmap is large.
  React.useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new IntersectionObserver(([entry]) => setNear(entry.isIntersecting), { root: scrollRoot.current, rootMargin: "100% 0px" });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [scrollRoot]);

  React.useEffect(() => {
    const holder = holderRef.current;
    if (!near || !holder) return;
    let cancelled = false;
    doc
      .pageCanvas(page, "original")
      .then((raw) => {
        if (cancelled) return;
        // Rotation happens in memory, on a canvas of its own: the picture and the pointer coordinates stay in the same space.
        const canvas = rotateCanvas(raw, rotation);
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.display = "block";
        holder.replaceChildren(canvas);
        setAspect(canvas.width / canvas.height);
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("failed"));
    return () => {
      cancelled = true;
      holder.replaceChildren();
    };
  }, [doc, near, page, rotation]);

  React.useEffect(() => {
    latest.current = { snipMode, status };
    if (!snipMode) hide(guideXRef.current, guideYRef.current);
  }, [snipMode, status]);

  // Pointer moves: no React state. One write per animation frame to the selection box or the crosshair guides.
  React.useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let raf = 0;
    let at: { x: number; y: number; mouse: boolean } | null = null;
    const paint = () => {
      raf = 0;
      if (!at) return;
      const { x, y, mouse } = at;
      const drag = dragRef.current;
      if (drag) {
        show(selectionRef.current, boxFromPoints(drag.start, toNormPoint(x, y, drag.rect)));
      } else if (latest.current.snipMode && latest.current.status === "ready" && mouse) {
        const p = toNormPoint(x, y, frame.getBoundingClientRect());
        if (guideXRef.current) Object.assign(guideXRef.current.style, { display: "block", left: pct(p.x) });
        if (guideYRef.current) Object.assign(guideYRef.current.style, { display: "block", top: pct(p.y) });
      }
    };
    const onMove = (e: PointerEvent) => {
      at = { x: e.clientX, y: e.clientY, mouse: e.pointerType === "mouse" };
      if (!raf) raf = requestAnimationFrame(paint);
    };
    frame.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      frame.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!snipMode || !e.isPrimary || status !== "ready" || (e.pointerType === "mouse" && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const start = toNormPoint(e.clientX, e.clientY, rect);
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { start, rect };
    hide(guideXRef.current, guideYRef.current);
    show(selectionRef.current, { ...start, w: 0, h: 0 });
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    hide(selectionRef.current);
    const box = boxFromPoints(drag.start, toNormPoint(e.clientX, e.clientY, drag.rect));
    if (isUsableBox(box)) onSnip(page, box);
  }

  function cancelDrag() {
    dragRef.current = null;
    hide(selectionRef.current);
  }

  return (
    <div
      ref={frameRef}
      data-page={page}
      role="group"
      aria-label={labels.page(page)}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={cancelDrag}
      onPointerLeave={() => hide(guideXRef.current, guideYRef.current)}
      style={{ aspectRatio: String(aspect) }}
      className={cn("relative w-full rounded-sm border border-border bg-white shadow-sm select-none", snipMode ? "cursor-crosshair touch-none" : "touch-auto")}
    >
      <div ref={holderRef} className="absolute inset-0 overflow-hidden rounded-sm" aria-hidden />
      {status !== "ready" && (
        <p role="status" className="absolute inset-0 grid place-items-center text-caption text-neutral-500">
          {status === "failed" ? labels.failed : labels.rendering}
        </p>
      )}

      {snips.map((snip, index) => {
        const selected = snip.id === selectedId;
        // A stitched problem can have several regions on one page, so the id alone is not unique here.
        return (
          <div key={`${snip.id}:${index}`} className="absolute" style={{ left: pct(snip.box.x), top: pct(snip.box.y), width: pct(snip.box.w), height: pct(snip.box.h) }}>
            <div aria-hidden className={cn("mark-ink absolute inset-0 rounded-[3px] transition-opacity", selected ? "opacity-100" : "opacity-70")} />
            <button
              type="button"
              aria-pressed={selected}
              aria-label={labels.snip(snip.number)}
              onClick={() => onSelect(snip.id)}
              className={cn("absolute inset-0 cursor-pointer rounded-[3px] border transition-colors", selected ? "border-brand ring-2 ring-brand/40" : "border-mark-foreground/40 hover:border-mark-foreground")}
            >
              <span className={cn("absolute -top-px -left-px rounded-br-md rounded-tl-[3px] px-1.5 py-0.5 text-[12px] leading-none font-semibold tabular-nums", selected ? "bg-brand text-brand-foreground" : "bg-mark text-neutral-900")}>
                {snip.number}
              </span>
            </button>
          </div>
        );
      })}

      {pending.map((part) => (
        <div key={part.key} className="absolute" style={{ left: pct(part.box.x), top: pct(part.box.y), width: pct(part.box.w), height: pct(part.box.h) }}>
          <div aria-label={labels.part(part.number, page)} className="pointer-events-none absolute inset-0 rounded-[3px] border-2 border-dashed border-brand bg-brand/10">
            <span className="absolute -top-px -left-px rounded-br-md rounded-tl-[2px] bg-brand px-1.5 py-0.5 text-[12px] leading-none font-semibold text-brand-foreground tabular-nums">{part.number}</span>
          </div>
          {part.newest && <FloatingToolbar box={part.box} toolbar={toolbar} />}
        </div>
      ))}

      {/* Crosshair guides and the drag rectangle. Always mounted and moved through refs (see above); hidden until used. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <span ref={guideXRef} style={{ display: "none" }} className="absolute inset-y-0 w-px bg-brand/40" />
        <span ref={guideYRef} style={{ display: "none" }} className="absolute inset-x-0 h-px bg-brand/40" />
        <div ref={selectionRef} style={{ display: "none" }} className="absolute rounded-[2px] border-2 border-brand bg-brand/15" />
      </div>
    </div>
  );
}

/**
 * Save / delete buttons right beside the region just drawn. It sits under the region's bottom corner (above it when
 * the region ends near the page bottom) and is counter-scaled by the viewer's zoom (`--zoom`), so it stays the same
 * size on screen however far the page is zoomed.
 */
function FloatingToolbar({ box, toolbar }: { box: NormBox; toolbar: RegionToolbar }) {
  const alignLeft = box.x + box.w < 0.4;
  const above = box.y + box.h > 0.9;
  return (
    <div
      role="toolbar"
      aria-label={toolbar.saveLabel}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ transform: "scale(calc(1 / var(--zoom, 1)))", transformOrigin: `${above ? "bottom" : "top"} ${alignLeft ? "left" : "right"}` }}
      className={cn("absolute z-30 flex w-max gap-1 rounded-lg border border-border bg-popover p-1 shadow-lg", alignLeft ? "left-0" : "right-0", above ? "bottom-full mb-2" : "top-full mt-2")}
    >
      <Button size="sm" onClick={toolbar.onSave}>
        {toolbar.saveLabel}
      </Button>
      <Button variant="ghost" size="sm" onClick={toolbar.onDelete}>
        {toolbar.deleteLabel}
      </Button>
    </div>
  );
}
