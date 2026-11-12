"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/** Minimal popover menu: click-outside + Escape to close, returns focus to the trigger. */
export function Dropdown({
  trigger,
  children,
  align = "end",
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void; id: string }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const id = React.useId();

  React.useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector<HTMLElement>("[aria-haspopup]")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v), id })}
      {open && (
        <div
          id={id}
          className={cn(
            "glass-card absolute top-full z-50 mt-2 min-w-48 rounded-xl bg-popover p-1.5 shadow-xl",
            align === "end" ? "right-0" : "left-0",
            className,
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ active, className, ...props }: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none",
        active && "bg-accent text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}
