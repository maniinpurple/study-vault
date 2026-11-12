import { TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

/** Amber warning that MUST accompany every AI-generated problem or variant (CLAUDE.md §4.6). */
export function ExperimentalBadge({ label, className }: { label: string; className?: string }) {
  return (
    <span
      role="note"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-warning/50 bg-warning/12 px-2 py-1 text-xs font-medium text-warning-foreground",
        className,
      )}
    >
      <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
      <span>{label.replace(/^⚠️\s*/, "")}</span>
    </span>
  );
}
