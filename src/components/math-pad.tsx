"use client";

import katex from "katex";
import * as React from "react";
import { Rnd } from "react-rnd";

import { useI18n } from "@/components/app-provider";
import { Button } from "@/components/ui/button";
import { MATH_KEYS, spliceText, wrapLatex, type MathGroup } from "@/lib/math-insert";
import { cn } from "@/lib/utils";

const GROUPS: readonly MathGroup[] = ["structure", "calculus", "relations", "greek", "matrices"];
const MIN_SIZE = { width: 520, height: 340 };

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Wide enough for two columns, and a little left of and above the Scratchpad's place, so the two can be open together. */
function initialRect(): Rect {
  const width = Math.min(680, window.innerWidth - 32);
  const height = Math.min(420, window.innerHeight - 120);
  return { width, height, x: Math.max(16, window.innerWidth - width - 56), y: Math.max(16, window.innerHeight - height - 100) };
}

function typeset(latex: string, displayMode: boolean): string {
  // KaTeX's own output for formulas we typed ourselves; `trust` stays off, so \href and friends are inert.
  return katex.renderToString(latex, { displayMode, throwOnError: false, strict: "ignore", output: "htmlAndMathml" });
}

/** A text field a formula can be inserted into: a textarea, or a single-line text/search input, that is on the page and usable. */
function isInsertTarget(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (!el || !el.isConnected || el.closest("[data-mathpad]")) return false;
  if (el instanceof HTMLTextAreaElement) return !el.disabled && !el.readOnly;
  return el instanceof HTMLInputElement && ["text", "search", "url", "email", ""].includes(el.type) && !el.disabled && !el.readOnly;
}

/**
 * Put `text` into `field` at its selection, the way typing would: through the native value setter and an `input` event, so a
 * React-controlled field sees the change and keeps it. The caret is left after the text and the field is focused again.
 */
function insertIntoField(field: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  const { value, caret } = spliceText(field.value, start, end, text);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), "value")?.set;
  setter?.call(field, value);
  field.dispatchEvent(new Event("input", { bubbles: true }));
  field.focus();
  field.setSelectionRange(caret, caret);
}

/**
 * Math Pad: a small floating window for typing a formula. Quick-insert buttons build common structures, a LaTeX box with an
 * instant KaTeX preview shows the result, and the formula can be copied or inserted, wrapped in `$…$` or `$$…$$`, into whichever
 * text field on the page was focused last. Opened from the speed-dial button (`FloatingTools`); its text is kept while closed.
 */
export function MathPad({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [rect, setRect] = React.useState<Rect | null>(null);
  const [latex, setLatex] = React.useState("");
  const [display, setDisplay] = React.useState(false);
  const [notice, setNotice] = React.useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const input = React.useRef<HTMLTextAreaElement>(null);
  /** The last text field the user was in, outside this window. Remembered at focus time, since clicking a button here leaves it. */
  const lastField = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const caretAfter = React.useRef<number | null>(null);
  const noticeTimer = React.useRef<number | null>(null);

  if (open && rect === null) setRect(initialRect());

  React.useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      if (isInsertTarget(e.target as Element | null)) lastField.current = e.target as HTMLInputElement | HTMLTextAreaElement;
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  React.useEffect(() => () => void (noticeTimer.current !== null && window.clearTimeout(noticeTimer.current)), []);

  // After a quick-insert the caret goes where the formula needs its first argument.
  React.useLayoutEffect(() => {
    if (caretAfter.current === null || !input.current) return;
    input.current.focus();
    input.current.setSelectionRange(caretAfter.current, caretAfter.current);
    caretAfter.current = null;
  }, [latex]);

  const say = (text: string, tone: "ok" | "warn") => {
    setNotice({ text, tone });
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2200);
  };

  function quickInsert(insert: string, caret?: number) {
    const box = input.current;
    const result = spliceText(latex, box?.selectionStart ?? latex.length, box?.selectionEnd ?? latex.length, insert, caret);
    caretAfter.current = result.caret;
    setLatex(result.value);
  }

  const wrapped = wrapLatex(latex, display);

  async function copy() {
    if (!wrapped) return;
    try {
      await navigator.clipboard.writeText(wrapped);
      say(t.mathpad.copied, "ok");
    } catch {
      // Clipboard access can be refused (insecure context, permissions): select the box so Ctrl+C works.
      input.current?.select();
      say(t.mathpad.copyFailed, "warn");
    }
  }

  function insert() {
    if (!wrapped) return;
    const field = lastField.current;
    if (!isInsertTarget(field)) return say(t.mathpad.noTarget, "warn");
    insertIntoField(field, wrapped);
    say(t.mathpad.inserted, "ok");
  }

  const preview = React.useDeferredValue(latex);
  const html = React.useMemo(() => (preview.trim() ? typeset(preview, display) : ""), [preview, display]);

  return (
    <>
      {rect && (
        <Rnd
          size={{ width: rect.width, height: rect.height }}
          position={{ x: rect.x, y: rect.y }}
          minWidth={Math.min(MIN_SIZE.width, window.innerWidth - 32)}
          minHeight={MIN_SIZE.height}
          bounds="window"
          dragHandleClassName="mathpad-drag"
          cancel=".mathpad-nodrag"
          disableDragging={!open}
          enableResizing={open}
          onDragStop={(_, d) => setRect((r) => (r ? { ...r, x: d.x, y: d.y } : r))}
          onResizeStop={(_, __, element, ___, position) => setRect({ width: element.offsetWidth, height: element.offsetHeight, x: position.x, y: position.y })}
          style={{ display: open ? "block" : "none", pointerEvents: "auto" }}
        >
          <div
            role="dialog"
            aria-modal={false}
            aria-label={t.mathpad.title}
            data-mathpad
            onKeyDown={(e) => e.key === "Escape" && onClose()}
            className="flex size-full animate-in flex-col overflow-hidden rounded-xl border-2 border-border bg-popover shadow-lg duration-150 fade-in zoom-in-95"
          >
            <header className="mathpad-drag flex shrink-0 cursor-grab items-center gap-2 border-b-2 border-border px-3 py-2 select-none active:cursor-grabbing">
              <h2 className="mr-auto truncate text-heading">{t.mathpad.title}</h2>
              <Button variant="ghost" size="sm" className="mathpad-nodrag" onClick={onClose} aria-label={t.mathpad.close}>
                {t.common.close}
              </Button>
            </header>

            {/* Two columns: the symbol palette scrolls on its own on the left; the editor stays put on the right. */}
            <div className="mathpad-nodrag flex min-h-0 flex-1">
              <div className="w-[48%] shrink-0 space-y-3 overflow-y-auto border-r-2 border-border px-3 pt-3 pb-3">
                {GROUPS.map((group) => (
                  <div key={group} role="group" aria-label={t.mathpad.groups[group]} className="space-y-1.5">
                    <p className="text-overline">{t.mathpad.groups[group]}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {MATH_KEYS.filter((key) => key.group === group).map((key) => {
                        const name = key.nameKey ? (t.mathpad.keys as Record<string, string>)[key.nameKey] : key.latex;
                        return (
                          <button
                            key={key.latex}
                            type="button"
                            aria-label={name}
                            title={name}
                            onClick={() => quickInsert(key.latex, key.caret)}
                            // No fixed height: a matrix is several lines tall and the button grows to hold it. KaTeX is scaled down so it stays compact.
                            className="inline-flex h-auto min-h-9 min-w-9 items-center justify-center rounded-md border border-input bg-card px-2.5 py-1.5 text-[15px] text-foreground transition-colors hover:bg-accent [&_.katex]:text-[0.8em]"
                          >
                            {/* Typeset by KaTeX from our own table, not from user input. */}
                            <span aria-hidden dangerouslySetInnerHTML={{ __html: typeset(key.face ?? key.latex, false) }} />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-3 p-3">
                <div className="space-y-1">
                  <label htmlFor="mathpad-latex" className="text-caption font-medium text-muted-foreground">
                    {t.mathpad.latexLabel}
                  </label>
                  <textarea
                    id="mathpad-latex"
                    ref={input}
                    value={latex}
                    rows={4}
                    spellCheck={false}
                    placeholder={t.mathpad.placeholder}
                    onChange={(e) => setLatex(e.target.value)}
                    className="block w-full resize-none rounded-md border-2 border-input bg-card px-2.5 py-2 font-mono text-[14px] leading-relaxed text-foreground placeholder:text-subtle"
                  />
                </div>

                <div className="flex min-h-0 flex-1 flex-col gap-1">
                  <p className="text-caption font-medium text-muted-foreground">{t.mathpad.preview}</p>
                  <div className="min-h-14 flex-1 overflow-auto rounded-md border border-border bg-card px-3 py-2">
                    {html ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <p className="text-sm text-subtle">{t.mathpad.previewEmpty}</p>}
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={display} onChange={(e) => setDisplay(e.target.checked)} className="size-4 accent-[var(--primary)]" />
                  {t.mathpad.display}
                </label>

                {/* Pinned to the bottom of the right column. */}
                <div className="flex shrink-0 flex-wrap items-center gap-2 border-t-2 border-border pt-3">
                  <Button size="sm" onClick={insert} disabled={!wrapped}>
                    {t.mathpad.insert}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void copy()} disabled={!wrapped}>
                    {t.mathpad.copy}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setLatex("")} disabled={!latex}>
                    {t.mathpad.clear}
                  </Button>
                  <span role="status" aria-live="polite" className={cn("min-w-0 basis-full truncate text-caption", notice?.tone === "warn" ? "text-warning" : "text-success")}>
                    {notice?.text ?? ""}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </Rnd>
      )}
    </>
  );
}
