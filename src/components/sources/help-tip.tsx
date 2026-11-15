"use client";

import * as React from "react";

import { useApp } from "@/components/app-provider";
import { cn } from "@/lib/utils";

/** A small "?" button whose popover explains the viewer's controls. Opens on hover and focus, toggles on click, closes on Esc. */
export function HelpTip() {
  const { t } = useApp();
  const id = React.useId();
  const [pinned, setPinned] = React.useState(false);
  const [hovered, setHovered] = React.useState(false);
  const open = pinned || hovered;
  const lines = [t.sources.tools.helpDrag, t.sources.tools.helpStitch, t.sources.tools.helpScroll, t.sources.tools.helpZoom];

  React.useEffect(() => {
    if (!pinned) return;
    const close = () => setPinned(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onPointer = (e: PointerEvent) => !(e.target as Element).closest(`[data-help-tip="${CSS.escape(id)}"]`) && close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [pinned, id]);

  return (
    <div data-help-tip={id} className="relative" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <button
        type="button"
        aria-label={t.sources.tools.help}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setPinned((v) => !v)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className={cn("grid size-7 place-items-center rounded-full border text-[14px] font-medium transition-colors", open ? "border-transparent bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:text-foreground")}
      >
        ?
      </button>
      {open && (
        <div id={id} role="tooltip" className="absolute top-full right-0 z-40 mt-2 w-64 space-y-1 rounded-lg border border-border bg-popover p-3 text-caption text-foreground shadow-lg">
          <p className="text-overline">{t.sources.tools.help}</p>
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}
