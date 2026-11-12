import type * as React from "react";

import { cn } from "@/lib/utils";

const CORNERS = [
  "-left-[6px] -top-[6px]",
  "-right-[6px] -top-[6px]",
  "-bottom-[6px] -left-[6px]",
  "-bottom-[6px] -right-[6px]",
] as const;

/**
 * Translucent "Evervault" surface with `+` crosshair markers on all four corners.
 * Use this (not ad-hoc borders) for every top-level card in the app.
 */
export function CrosshairCard({
  className,
  children,
  glow = false,
  ...props
}: React.ComponentProps<"div"> & { glow?: boolean }) {
  return (
    <div
      data-slot="crosshair-card"
      className={cn("glass-card relative rounded-none p-6", glow && "shadow-[0_0_80px_-20px_var(--glow-from)]", className)}
      {...props}
    >
      {CORNERS.map((position) => (
        <span key={position} aria-hidden className={cn("crosshair-mark", position)} />
      ))}
      {children}
    </div>
  );
}
