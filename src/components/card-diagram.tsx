"use client";

import { StoredImage } from "@/components/stored-image";

/** The preserved figure/graph crop of a card, loaded lazily by path. Renders nothing when absent. */
export function CardDiagram({ path, alt, caption }: { path: string | null; alt: string; caption?: string }) {
  if (!path) return null;
  return (
    <figure className="space-y-1.5">
      {caption && <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>}
      <StoredImage path={path} alt={alt} className="max-h-80 w-auto max-w-full rounded-lg border border-border bg-white object-contain" />
    </figure>
  );
}
