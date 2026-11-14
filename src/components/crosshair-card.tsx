import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The standard resting surface: hairline, 12px radius, `--shadow-xs` (DESIGN_SYSTEM.md §4).
 * `glow` is accepted for older call sites and has no visual effect.
 */
export function Surface({ className, glow: _glow, ...props }: React.ComponentProps<"div"> & { glow?: boolean }) {
  void _glow;
  return <div data-slot="surface" className={cn("rounded-lg border border-border bg-card p-6 shadow-xs", className)} {...props} />;
}

export { Surface as CrosshairCard };
