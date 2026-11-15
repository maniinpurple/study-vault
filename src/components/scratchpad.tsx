"use client";

import { Pencil } from "lucide-react";
import * as React from "react";
import { Rnd } from "react-rnd";
import { ReactSketchCanvas, type ReactSketchCanvasRef } from "react-sketch-canvas";

import { useApp } from "@/components/app-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Paper = "plain" | "dots" | "lined" | "grid";
type PenName = "black" | "red" | "yellow";

const PAPERS: readonly Paper[] = ["plain", "dots", "lined", "grid"];

/**
 * Paper and ink are physical objects, not interface chrome: they keep the same colors in Light and Dark, like the exam
 * pages do (DESIGN_SYSTEM.md §2.4). Yellow is a highlighter: wide and translucent.
 */
const PAPER_COLORS = { base: "oklch(0.985 0.012 92)", dot: "oklch(0.6 0.02 85)", line: "oklch(0.8 0.04 235)", grid: "oklch(0.87 0.025 235)" } as const;
const PENS: Record<PenName, { color: string; width: number }> = {
  black: { color: "oklch(0.22 0.01 80)", width: 2.5 },
  red: { color: "oklch(0.58 0.2 27)", width: 2.5 },
  yellow: { color: "oklch(0.87 0.17 95 / 0.6)", width: 12 },
};
const ERASER_WIDTH = 22;
const MIN_SIZE = { width: 300, height: 280 };

/** CSS-only paper patterns. `cell` is the pitch in pixels (the same function draws the small swatches). */
function paperStyle(paper: Paper, cell: number): React.CSSProperties {
  const { base, dot, line, grid } = PAPER_COLORS;
  const size = `${cell}px ${cell}px`;
  switch (paper) {
    case "dots":
      return { backgroundColor: base, backgroundImage: `radial-gradient(circle, ${dot} ${Math.max(0.8, cell * 0.045)}px, transparent ${Math.max(1, cell * 0.055)}px)`, backgroundSize: size, backgroundPosition: `${cell / 2}px ${cell / 2}px` };
    case "lined":
      return { backgroundColor: base, backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${cell - 1}px, ${line} ${cell - 1}px, ${line} ${cell}px)` };
    case "grid":
      return { backgroundColor: base, backgroundImage: `linear-gradient(${grid} 1px, transparent 1px), linear-gradient(90deg, ${grid} 1px, transparent 1px)`, backgroundSize: size };
    default:
      return { backgroundColor: base };
  }
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** First placement: bottom-right, just above the trigger, and never larger than the screen. */
function initialRect(): Rect {
  const width = Math.min(440, window.innerWidth - 32);
  const height = Math.min(480, window.innerHeight - 120);
  return { width, height, x: Math.max(16, window.innerWidth - width - 24), y: Math.max(16, window.innerHeight - height - 84) };
}

/** Diagonal grip drawn in the window's bottom-right corner, so the resize handle can be found. */
function Grip() {
  return (
    <svg aria-hidden viewBox="0 0 12 12" className="absolute right-1 bottom-1 size-3 text-subtle">
      <path d="M11 1 1 11M11 6 6 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/**
 * Scratchpad, in the style of Quick Note: a round button at the bottom-right opens a floating window you can drag by its
 * header and resize from any edge. It draws on a paper of your choice, in black, red or a yellow highlighter, with an
 * eraser, undo and clear. Nothing is saved: the drawing lives in this component, survives closing the window and moving
 * between pages, and is gone on reload. Only the window itself takes clicks; the page underneath stays fully usable.
 */
export function Scratchpad() {
  const { t } = useApp();
  const canvas = React.useRef<ReactSketchCanvasRef>(null);
  const [open, setOpen] = React.useState(false);
  const [rect, setRect] = React.useState<Rect | null>(null);
  const [tool, setTool] = React.useState<"pen" | "eraser">("pen");
  const [pen, setPen] = React.useState<PenName>("black");
  const [paper, setPaper] = React.useState<Paper>("plain");

  function toggle() {
    // The window is created on first open (it needs the screen size) and then kept mounted, so strokes persist.
    setRect((current) => current ?? initialRect());
    setOpen((value) => !value);
  }

  function choosePen(name: PenName) {
    setPen(name);
    setTool("pen");
    canvas.current?.eraseMode(false);
  }

  function chooseTool(next: "pen" | "eraser") {
    setTool(next);
    canvas.current?.eraseMode(next === "eraser");
  }

  const segment = (active: boolean) => cn("h-7 rounded-md px-3 text-[14px] transition-colors", active ? "bg-card font-medium text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground");

  return (
    // Covers the screen but takes no clicks itself: only the button and the window below are interactive.
    // z-70 keeps it above the image lightbox (z-60) and the mobile sidebar sheet (z-50).
    <div className="pointer-events-none fixed inset-0 z-[70]">
      {rect && (
        <Rnd
          size={{ width: rect.width, height: rect.height }}
          position={{ x: rect.x, y: rect.y }}
          minWidth={MIN_SIZE.width}
          minHeight={MIN_SIZE.height}
          bounds="window"
          dragHandleClassName="scratch-drag"
          cancel=".scratch-nodrag"
          disableDragging={!open}
          enableResizing={open}
          onDragStop={(_, d) => setRect((r) => (r ? { ...r, x: d.x, y: d.y } : r))}
          onResizeStop={(_, __, element, ___, position) => setRect({ width: element.offsetWidth, height: element.offsetHeight, x: position.x, y: position.y })}
          resizeHandleComponent={{ bottomRight: <Grip /> }}
          style={{ display: open ? "block" : "none", pointerEvents: "auto" }}
        >
          <div
            role="dialog"
            aria-modal={false}
            aria-label={t.scratchpad.title}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
            className="flex size-full animate-in flex-col overflow-hidden rounded-xl border-2 border-border bg-popover shadow-lg duration-150 fade-in zoom-in-95"
          >
            {/* Drag handle */}
            <header className="scratch-drag flex shrink-0 cursor-grab items-center gap-2 border-b-2 border-border px-3 py-2 select-none active:cursor-grabbing">
              <h2 className="mr-auto truncate text-heading" title={t.scratchpad.hint}>
                {t.scratchpad.title}
              </h2>
              <div role="radiogroup" aria-label={t.scratchpad.paperLabel} className="scratch-nodrag flex gap-1">
                {PAPERS.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={paper === kind}
                    aria-label={t.scratchpad.paper[kind]}
                    title={t.scratchpad.paper[kind]}
                    onClick={() => setPaper(kind)}
                    style={paperStyle(kind, 7)}
                    className={cn("size-6 rounded-md border", paper === kind ? "border-brand ring-2 ring-brand/40" : "border-border-strong hover:border-foreground")}
                  />
                ))}
              </div>
              <Button variant="ghost" size="sm" className="scratch-nodrag" onClick={() => setOpen(false)} aria-label={t.scratchpad.close}>
                {t.common.close}
              </Button>
            </header>

            {/* Tools */}
            <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border px-3 py-1.5">
              <div role="radiogroup" aria-label={t.scratchpad.colorLabel} className="flex gap-1.5">
                {(Object.keys(PENS) as PenName[]).map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="radio"
                    aria-checked={tool === "pen" && pen === name}
                    aria-label={t.scratchpad.colors[name]}
                    title={t.scratchpad.colors[name]}
                    onClick={() => choosePen(name)}
                    className={cn("grid size-6 place-items-center rounded-full border transition-shadow", tool === "pen" && pen === name ? "border-transparent ring-2 ring-foreground ring-offset-2 ring-offset-popover" : "border-border-strong")}
                  >
                    <span className="size-4 rounded-full" style={{ backgroundColor: PENS[name].color.replace(/ \/ [\d.]+\)/, ")") }} />
                  </button>
                ))}
              </div>
              <div role="radiogroup" aria-label={t.scratchpad.title} className="flex rounded-lg bg-muted p-0.5">
                {(["pen", "eraser"] as const).map((option) => (
                  <button key={option} type="button" role="radio" aria-checked={tool === option} onClick={() => chooseTool(option)} className={segment(tool === option)}>
                    {t.scratchpad[option]}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex">
                <Button variant="ghost" size="sm" onClick={() => canvas.current?.undo()}>
                  {t.scratchpad.undo}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => canvas.current?.clearCanvas()}>
                  {t.scratchpad.clear}
                </Button>
              </div>
            </div>

            {/* Paper + drawing surface */}
            <div style={paperStyle(paper, 28)} className="relative min-h-0 flex-1">
              <ReactSketchCanvas
                ref={canvas}
                aria-label={t.scratchpad.canvas}
                width="100%"
                height="100%"
                strokeColor={PENS[pen].color}
                strokeWidth={PENS[pen].width}
                eraserWidth={ERASER_WIDTH}
                canvasColor="transparent"
                style={{ border: "none", touchAction: "none", cursor: tool === "eraser" ? "cell" : "crosshair" }}
              />
            </div>
          </div>
        </Rnd>
      )}

      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={t.scratchpad.open}
        title={t.scratchpad.open}
        className="pointer-events-auto absolute right-4 bottom-4 grid size-12 place-items-center rounded-full border-2 border-border bg-primary text-primary-foreground shadow-md transition-transform hover:-translate-y-px active:translate-x-[2px] active:translate-y-[2px] active:shadow-none sm:right-6 sm:bottom-6"
      >
        <Pencil className="size-5" aria-hidden />
      </button>
    </div>
  );
}
