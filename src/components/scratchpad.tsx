"use client";

import { Eraser, Pencil, Type } from "lucide-react";
import * as React from "react";
import { Rnd } from "react-rnd";
import { ReactSketchCanvas, type ReactSketchCanvasRef } from "react-sketch-canvas";

import { useI18n } from "@/components/app-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Paper = "plain" | "dots" | "lined" | "grid";
type PenName = "black" | "red" | "yellow";
type Tool = "pen" | "eraser" | "text";

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
/** Typed text is never the translucent highlighter: yellow text would be unreadable on the paper. */
const TEXT_COLORS: Record<PenName, string> = { black: PENS.black.color, red: PENS.red.color, yellow: PENS.black.color };
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

/** First placement: bottom-right, just above the speed-dial button, and never larger than the screen. */
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

interface TextNote {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
}

/**
 * Scratchpad, in the style of Quick Note: a floating window you can drag by its header and resize from any edge. It draws on a
 * paper of your choice, in black, red or a yellow highlighter, with an eraser, a text tool, undo and clear. Nothing is saved: the
 * drawing lives in this component, survives closing the window and moving between pages, and is gone on reload. Only the window
 * itself takes clicks; the page underneath stays fully usable. Opened and closed from the speed-dial button (`FloatingTools`).
 */
export function Scratchpad({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const canvas = React.useRef<ReactSketchCanvasRef>(null);
  const [rect, setRect] = React.useState<Rect | null>(null);
  const [tool, setTool] = React.useState<Tool>("pen");
  const [pen, setPen] = React.useState<PenName>("black");
  const [paper, setPaper] = React.useState<Paper>("plain");
  const [notes, setNotes] = React.useState<TextNote[]>([]);
  /** A text box being typed: where it was clicked (px inside the paper) and its text so far. */
  const [draft, setDraftState] = React.useState<{ x: number; y: number; text: string } | null>(null);
  /** The same draft, readable synchronously: a blur can arrive in the same tick as Enter, and must not add the note twice. */
  const draftRef = React.useRef<{ x: number; y: number; text: string } | null>(null);
  const setDraft = (next: { x: number; y: number; text: string } | null) => {
    draftRef.current = next;
    setDraftState(next);
  };
  /** What was done, oldest first, so Undo takes back the last stroke or the last note, whichever came last. */
  const history = React.useRef<("stroke" | "text")[]>([]);
  const nextId = React.useRef(1);

  // The window is created on first open (it needs the screen size) and then kept mounted, so the drawing persists.
  if (open && rect === null) setRect(initialRect());

  function choosePen(name: PenName) {
    setPen(name);
    chooseTool(tool === "eraser" ? "pen" : tool);
  }

  function chooseTool(next: Tool) {
    commitDraft();
    setTool(next);
    canvas.current?.eraseMode(next === "eraser");
  }

  function commitDraft() {
    const current = draftRef.current;
    if (!current) return;
    setDraft(null);
    const text = current.text.trim();
    if (!text) return;
    setNotes((prev) => [...prev, { id: nextId.current++, x: current.x, y: current.y, text, color: TEXT_COLORS[pen] }]);
    history.current.push("text");
  }

  function undo() {
    if (draftRef.current) return setDraft(null);
    const last = history.current.pop();
    if (last === "text") setNotes((prev) => prev.slice(0, -1));
    else if (last === "stroke") canvas.current?.undo();
  }

  function clear() {
    canvas.current?.clearCanvas();
    setNotes([]);
    setDraft(null);
    history.current = [];
  }

  const segment = (active: boolean) => cn("flex h-7 items-center gap-1.5 rounded-md px-3 text-[14px] transition-colors", active ? "bg-card font-medium text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground");

  return (
    <>
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
            onKeyDown={(e) => e.key === "Escape" && !draft && onClose()}
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
              <Button variant="ghost" size="sm" className="scratch-nodrag" onClick={onClose} aria-label={t.scratchpad.close}>
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
                    aria-checked={tool !== "eraser" && pen === name}
                    aria-label={t.scratchpad.colors[name]}
                    title={t.scratchpad.colors[name]}
                    onClick={() => choosePen(name)}
                    className={cn("grid size-6 place-items-center rounded-full border transition-shadow", tool !== "eraser" && pen === name ? "border-transparent ring-2 ring-foreground ring-offset-2 ring-offset-popover" : "border-border-strong")}
                  >
                    <span className="size-4 rounded-full" style={{ backgroundColor: PENS[name].color.replace(/ \/ [\d.]+\)/, ")") }} />
                  </button>
                ))}
              </div>
              <div role="radiogroup" aria-label={t.scratchpad.title} className="flex rounded-lg bg-muted p-0.5">
                {(["pen", "eraser", "text"] as const).map((option) => (
                  <button key={option} type="button" role="radio" aria-checked={tool === option} onClick={() => chooseTool(option)} title={option === "text" ? t.scratchpad.textHint : undefined} className={segment(tool === option)}>
                    {option === "pen" ? <Pencil className="size-3.5" aria-hidden /> : option === "eraser" ? <Eraser className="size-3.5" aria-hidden /> : <Type className="size-3.5" aria-hidden />}
                    {t.scratchpad[option]}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex">
                <Button variant="ghost" size="sm" onClick={undo}>
                  {t.scratchpad.undo}
                </Button>
                <Button variant="ghost" size="sm" onClick={clear}>
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
                onStroke={() => history.current.push("stroke")}
                style={{ border: "none", touchAction: "none", cursor: tool === "eraser" ? "cell" : "crosshair" }}
              />

              {/* Typed notes sit on top of the strokes. They only take clicks while the Text tool is armed. */}
              <div className={cn("absolute inset-0 overflow-hidden", tool === "text" ? "cursor-text" : "pointer-events-none")} onClick={(e) => {
                if (tool !== "text" || e.target !== e.currentTarget) return;
                commitDraft();
                const box = e.currentTarget.getBoundingClientRect();
                setDraft({ x: e.clientX - box.left, y: e.clientY - box.top, text: "" });
              }}>
                {notes.map((note) => (
                  <span key={note.id} className="pointer-events-none absolute text-[18px] leading-6 whitespace-pre" style={{ left: note.x, top: note.y, color: note.color }}>
                    {note.text}
                  </span>
                ))}
                {draft && (
                  <input
                    autoFocus
                    value={draft.text}
                    aria-label={t.scratchpad.textPlaceholder}
                    placeholder={t.scratchpad.textPlaceholder}
                    onChange={(e) => setDraft({ ...draft, text: e.target.value })}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") commitDraft();
                      if (e.key === "Escape") setDraft(null);
                    }}
                    onBlur={commitDraft}
                    style={{ left: draft.x, top: draft.y - 4, color: TEXT_COLORS[pen] }}
                    className="absolute h-8 w-48 max-w-[calc(100%-1rem)] border-b-2 border-dashed border-brand bg-transparent text-[18px] outline-none"
                  />
                )}
              </div>
            </div>
          </div>
        </Rnd>
      )}
    </>
  );
}
