"use client";

import { Check, Loader2 } from "lucide-react";
import * as React from "react";

import { useApp } from "@/components/app-provider";
import type { ScanBox } from "@/components/scanner/types";
import { boxFromPoints, HANDLES, isUsableBox, moveBox, resizeBox, toNormPoint, type Handle, type NormBox, type Point } from "@/lib/scan-geometry";
import { format } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Target = "box" | "figure";

type Drag =
  | { kind: "draw"; target: Target; figureFor: string | null; start: Point; box: NormBox }
  | { kind: "move"; id: string; target: Target; origin: NormBox; start: Point; box: NormBox }
  | { kind: "resize"; id: string; target: Target; handle: Handle; origin: NormBox; box: NormBox };

const HANDLE_POSITION: Record<Handle, string> = {
  nw: "-top-1.5 -left-1.5 cursor-nwse-resize",
  n: "-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize",
  ne: "-top-1.5 -right-1.5 cursor-nesw-resize",
  e: "top-1/2 -right-1.5 -translate-y-1/2 cursor-ew-resize",
  se: "-right-1.5 -bottom-1.5 cursor-nwse-resize",
  s: "-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize",
  sw: "-bottom-1.5 -left-1.5 cursor-nesw-resize",
  w: "top-1/2 -left-1.5 -translate-y-1/2 cursor-ew-resize",
};

const pct = (n: number) => `${n * 100}%`;
const NUDGE = 0.005;

interface Props {
  /** Page bitmap to show (already filtered if the scan filter is on). Null while it renders. */
  canvas: HTMLCanvasElement | null;
  aspectRatio: number;
  zoom: number;
  /** Draw mode captures pointer drags; scroll mode leaves touch gestures to the browser. */
  drawMode: boolean;
  /** Boxes on the visible page only. */
  boxes: ScanBox[];
  /** Boxes that already produced a draft are read-only. */
  lockedIds: ReadonlySet<string>;
  selectedId: string | null;
  /** When set, the next drag draws the figure sub-box of this question. */
  figureTargetId: string | null;
  onCreate(box: NormBox): void;
  onSelect(id: string | null): void;
  onGeometry(id: string, target: Target, box: NormBox): void;
  onFigureDrawn(id: string, box: NormBox): void;
  onCancelFigure(): void;
  onDelete(id: string): void;
}

/** The exam page plus its interactive box overlay. Everything is positioned in page-relative percentages. */
export function PageCanvas({ canvas, aspectRatio, zoom, drawMode, boxes, lockedIds, selectedId, figureTargetId, onCreate, onSelect, onGeometry, onFigureDrawn, onCancelFigure, onDelete }: Props) {
  const { t } = useApp();
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const bitmapRef = React.useRef<HTMLCanvasElement>(null);
  const [drag, setDrag] = React.useState<Drag | null>(null);

  // Paint the page bitmap into the visible <canvas>.
  React.useEffect(() => {
    const target = bitmapRef.current;
    if (!target || !canvas) return;
    target.width = canvas.width;
    target.height = canvas.height;
    target.getContext("2d")?.drawImage(canvas, 0, 0);
  }, [canvas]);

  const geometryOf = React.useCallback(
    (id: string, target: Target): NormBox | null => {
      const box = boxes.find((b) => b.id === id);
      return target === "figure" ? (box?.figure ?? null) : (box?.box ?? null);
    },
    [boxes],
  );

  function pointFrom(e: { clientX: number; clientY: number }): Point {
    return toNormPoint(e.clientX, e.clientY, overlayRef.current?.getBoundingClientRect() ?? { left: 0, top: 0, width: 0, height: 0 });
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!drawMode || !canvas || (e.pointerType === "mouse" && e.button !== 0)) return;
    const el = e.target as HTMLElement;
    if (el.closest("button")) return;
    const p = pointFrom(e);

    const startDrag = (next: Drag) => {
      overlayRef.current?.setPointerCapture(e.pointerId);
      setDrag(next);
    };

    if (figureTargetId) {
      startDrag({ kind: "draw", target: "figure", figureFor: figureTargetId, start: p, box: { ...p, w: 0, h: 0 } });
      return;
    }

    const holder = el.closest<HTMLElement>("[data-target]");
    const id = holder?.dataset.boxId;
    const target = holder?.dataset.target as Target | undefined;
    if (holder && id && target) {
      onSelect(id);
      const origin = geometryOf(id, target);
      if (!origin || lockedIds.has(id)) return;
      const handle = el.closest<HTMLElement>("[data-handle]")?.dataset.handle as Handle | undefined;
      startDrag(handle ? { kind: "resize", id, target, handle, origin, box: origin } : { kind: "move", id, target, origin, start: p, box: origin });
      return;
    }

    onSelect(null);
    startDrag({ kind: "draw", target: "box", figureFor: null, start: p, box: { ...p, w: 0, h: 0 } });
  }

  /** Box produced by `drag` when the pointer is at `p`. */
  function boxAt(current: Drag, p: Point): NormBox {
    if (current.kind === "draw") return boxFromPoints(current.start, p);
    if (current.kind === "move") return moveBox(current.origin, p.x - current.start.x, p.y - current.start.y);
    return resizeBox(current.origin, current.handle, p);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (drag) setDrag({ ...drag, box: boxAt(drag, pointFrom(e)) });
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag) return;
    setDrag(null);
    // Commit the release position itself: the last pointermove can lag behind it (fast flicks, touch, coalesced events).
    const box = boxAt(drag, pointFrom(e));
    if (drag.kind === "draw") {
      if (!isUsableBox(box)) return;
      if (drag.figureFor) onFigureDrawn(drag.figureFor, box);
      else onCreate(box);
    } else {
      onGeometry(drag.id, drag.target, box);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      if (figureTargetId) onCancelFigure();
      else onSelect(null);
      return;
    }
    const selected = boxes.find((b) => b.id === selectedId);
    if (!selected || lockedIds.has(selected.id)) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      onDelete(selected.id);
      return;
    }
    const step = e.shiftKey ? NUDGE * 4 : NUDGE;
    const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = delta[e.key];
    if (move) {
      e.preventDefault();
      onGeometry(selected.id, "box", moveBox(selected.box, move[0], move[1]));
    }
  }

  const showBox = (b: ScanBox, target: Target): NormBox | null => {
    const stored = target === "figure" ? b.figure : b.box;
    return drag && drag.kind !== "draw" && drag.id === b.id && drag.target === target ? drag.box : stored;
  };

  return (
    <div className="max-h-[78dvh] overflow-auto rounded-lg border border-border bg-muted/30 p-2">
      <div className="relative mx-auto" style={{ width: pct(zoom), aspectRatio: String(aspectRatio) }}>
        {canvas ? (
          <canvas ref={bitmapRef} className="absolute inset-0 size-full rounded-sm bg-white shadow-lg" aria-hidden />
        ) : (
          <div className="absolute inset-0 grid place-items-center rounded-sm bg-muted/60 text-sm text-muted-foreground" role="status">
            <span className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden />{t.scanner.canvas.rendering}</span>
          </div>
        )}

        <div
          ref={overlayRef}
          role="application"
          tabIndex={0}
          aria-label={t.scanner.canvas.label}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => setDrag(null)}
          onKeyDown={onKeyDown}
          className={cn(
            "absolute inset-0 select-none outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            drawMode ? "touch-none cursor-crosshair" : "touch-auto",
            figureTargetId && "cursor-cell",
          )}
        >
          {/* Question boxes first so figure boxes (drawn after) sit on top and stay grabbable. */}
          {boxes.map((b) => {
            const geometry = showBox(b, "box");
            if (!geometry) return null;
            const locked = lockedIds.has(b.id);
            const selected = selectedId === b.id && !locked;
            return (
              <div
                key={b.id}
                data-box-id={b.id}
                data-target="box"
                onClick={() => !drawMode && onSelect(b.id)}
                style={{ left: pct(geometry.x), top: pct(geometry.y), width: pct(geometry.w), height: pct(geometry.h) }}
                className={cn(
                  "absolute border-2",
                  locked ? "border-dashed border-muted-foreground/70 bg-muted/20" : selected ? "cursor-move border-primary bg-primary/15 ring-2 ring-primary/40" : "cursor-move border-primary/80 bg-primary/10",
                )}
              >
                <span className={cn("pointer-events-none absolute top-0 left-0 flex items-center gap-1 rounded-br-md px-1.5 py-0.5 text-[11px] leading-none font-semibold", locked ? "bg-muted-foreground text-background" : "bg-primary text-primary-foreground")}>
                  {locked && <Check className="size-3" aria-label={t.scanner.box.extracted} />}
                  {format(t.scanner.box.label, { n: b.number })}
                </span>
                {selected && HANDLES.map((h) => <span key={h} data-handle={h} className={cn("absolute size-3 rounded-sm border border-primary-foreground bg-primary", HANDLE_POSITION[h])} />)}
              </div>
            );
          })}

          {boxes.map((b) => {
            const geometry = showBox(b, "figure");
            if (!geometry) return null;
            const locked = lockedIds.has(b.id);
            const selected = selectedId === b.id && !locked;
            return (
              <div
                key={`${b.id}-figure`}
                data-box-id={b.id}
                data-target="figure"
                style={{ left: pct(geometry.x), top: pct(geometry.y), width: pct(geometry.w), height: pct(geometry.h) }}
                className={cn("absolute border-2 border-dashed border-chart-3 bg-chart-3/15", !locked && "cursor-move")}
              >
                <span className="pointer-events-none absolute right-0 bottom-0 rounded-tl-md bg-chart-3 px-1.5 py-0.5 text-[11px] leading-none font-semibold text-black">{t.scanner.box.figure}</span>
                {selected && HANDLES.map((h) => <span key={h} data-handle={h} className={cn("absolute size-3 rounded-sm border border-black/60 bg-chart-3", HANDLE_POSITION[h])} />)}
              </div>
            );
          })}

          {drag?.kind === "draw" && (
            <div
              aria-hidden
              style={{ left: pct(drag.box.x), top: pct(drag.box.y), width: pct(drag.box.w), height: pct(drag.box.h) }}
              className={cn("pointer-events-none absolute border-2", drag.target === "figure" ? "border-dashed border-chart-3 bg-chart-3/20" : "border-primary bg-primary/20")}
            />
          )}
        </div>
      </div>
    </div>
  );
}
