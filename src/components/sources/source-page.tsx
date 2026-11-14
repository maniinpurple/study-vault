"use client";

import * as React from "react";

import { boxFromPoints, isUsableBox, toNormPoint, type NormBox, type Point } from "@/lib/scan-geometry";
import type { ScanDocument } from "@/lib/scan-source";
import { cn } from "@/lib/utils";

export interface PageSnip {
  id: string;
  number: number;
  box: NormBox;
}

interface Props {
  doc: ScanDocument;
  page: number;
  /** Scroll container, used as the lazy-render root. */
  scrollRoot: React.RefObject<HTMLElement | null>;
  snips: PageSnip[];
  selectedId: string | null;
  /** Snip mode captures drags; otherwise the page only scrolls and snips are tappable. */
  snipMode: boolean;
  labels: { page: string; snip: (n: number) => string; rendering: string; failed: string };
  onSnip(page: number, box: NormBox, rect: DOMRect): void;
  onSelect(id: string): void;
}

const pct = (n: number) => `${n * 100}%`;

/** One exam page: lazily rendered bitmap, highlighter marks for saved snips, and the drag-to-snip selection. */
export function SourcePage({ doc, page, scrollRoot, snips, selectedId, snipMode, labels, onSnip, onSelect }: Props) {
  const frameRef = React.useRef<HTMLDivElement>(null);
  const holderRef = React.useRef<HTMLDivElement>(null);
  const [near, setNear] = React.useState(false);
  const [aspect, setAspect] = React.useState(1 / Math.SQRT2);
  const [status, setStatus] = React.useState<"idle" | "ready" | "failed">("idle");
  const [drag, setDrag] = React.useState<{ start: Point; box: NormBox } | null>(null);
  const [hover, setHover] = React.useState<Point | null>(null);

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
      .then((canvas) => {
        if (cancelled) return;
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
  }, [doc, near, page]);

  const pointFrom = (e: { clientX: number; clientY: number }) => toNormPoint(e.clientX, e.clientY, frameRef.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: 0, height: 0 });

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!snipMode || status !== "ready" || (e.pointerType === "mouse" && e.button !== 0)) return;
    if ((e.target as HTMLElement).closest("button")) return;
    const start = pointFrom(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ start, box: { ...start, w: 0, h: 0 } });
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const point = pointFrom(e);
    if (drag) setDrag({ start: drag.start, box: boxFromPoints(drag.start, point) });
    else if (snipMode && e.pointerType === "mouse") setHover(point);
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    const box = boxFromPoints(drag.start, pointFrom(e));
    setDrag(null);
    const frame = frameRef.current?.getBoundingClientRect();
    if (!frame || !isUsableBox(box)) return;
    onSnip(page, box, new DOMRect(frame.left + box.x * frame.width, frame.top + box.y * frame.height, box.w * frame.width, box.h * frame.height));
  }

  return (
    <div
      ref={frameRef}
      data-page={page}
      role="group"
      aria-label={labels.page}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      onPointerLeave={() => setHover(null)}
      style={{ aspectRatio: String(aspect) }}
      className={cn("relative w-full overflow-hidden rounded-sm border border-border bg-white shadow-sm select-none", snipMode ? "cursor-crosshair touch-none" : "touch-auto")}
    >
      <div ref={holderRef} className="absolute inset-0" aria-hidden />
      {status !== "ready" && (
        <p role="status" className="absolute inset-0 grid place-items-center text-caption text-neutral-500">
          {status === "failed" ? labels.failed : labels.rendering}
        </p>
      )}

      {snips.map((snip) => {
        const selected = snip.id === selectedId;
        return (
          <div key={snip.id} className="absolute" style={{ left: pct(snip.box.x), top: pct(snip.box.y), width: pct(snip.box.w), height: pct(snip.box.h) }}>
            <div aria-hidden className={cn("mark-ink absolute inset-0 rounded-[3px] transition-opacity", selected ? "opacity-100" : "opacity-70")} />
            <button
              type="button"
              aria-pressed={selected}
              aria-label={labels.snip(snip.number)}
              onClick={() => onSelect(snip.id)}
              className={cn("absolute inset-0 cursor-pointer rounded-[3px] border transition-colors", selected ? "border-brand ring-2 ring-brand/40" : "border-mark-foreground/40 hover:border-mark-foreground")}
            >
              <span className={cn("absolute -top-px -left-px rounded-br-md rounded-tl-[3px] px-1.5 py-0.5 text-[11px] leading-none font-semibold tabular-nums", selected ? "bg-brand text-brand-foreground" : "bg-mark text-neutral-900")}>
                {snip.number}
              </span>
            </button>
          </div>
        );
      })}

      {/* Crosshair guides follow the pointer while the snip tool is armed. */}
      {snipMode && hover && !drag && status === "ready" && (
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <span className="absolute inset-y-0 w-px bg-brand/40" style={{ left: pct(hover.x) }} />
          <span className="absolute inset-x-0 h-px bg-brand/40" style={{ top: pct(hover.y) }} />
        </div>
      )}

      {drag && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-[2px] border border-brand shadow-[0_0_0_9999px_oklch(0.2_0.01_80/0.28)]"
          style={{ left: pct(drag.box.x), top: pct(drag.box.y), width: pct(drag.box.w), height: pct(drag.box.h) }}
        />
      )}
    </div>
  );
}
