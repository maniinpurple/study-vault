"use client";

import { LayoutGroup, motion } from "framer-motion";

import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** Segmented Grid / List / Detailed switch with a sliding thumb. `id` keeps the thumbs of separate toggles apart. */
export function ViewToggle<T extends string>({ id, label, value, modes, labels, onChange }: { id: string; label: string; value: T; modes: readonly T[]; labels: Record<T, string>; onChange: (mode: T) => void }) {
  return (
    <LayoutGroup id={id}>
      <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-muted p-0.5">
        {modes.map((mode) => (
          <button key={mode} type="button" role="radio" aria-checked={value === mode} onClick={() => onChange(mode)} className={cn("relative h-7 rounded-md px-2.5 text-[13px] transition-colors", value === mode ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {value === mode && <motion.span layoutId="view-thumb" transition={spring.snappy} className="absolute inset-0 rounded-md bg-card shadow-xs" aria-hidden />}
            <span className="relative">{labels[mode]}</span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  );
}
