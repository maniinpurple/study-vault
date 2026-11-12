"use client";

import * as React from "react";

import { useVault } from "@/components/app-provider";
import { useObjectUrl } from "@/components/scanner/use-object-url";

/** The preserved figure/graph crop of a card, loaded from local storage by path. Renders nothing when absent. */
export function CardDiagram({ path, alt, caption }: { path: string | null; alt: string; caption?: string }) {
  const { actions } = useVault();
  const [loaded, setLoaded] = React.useState<{ path: string; blob: Blob | null } | null>(null);
  const url = useObjectUrl(loaded && loaded.path === path ? loaded.blob : null);

  React.useEffect(() => {
    if (!path) return;
    let cancelled = false;
    actions
      .getBlob(path)
      .then((blob) => {
        if (!cancelled) setLoaded({ path, blob });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ path, blob: null });
      });
    return () => {
      cancelled = true;
    };
  }, [actions, path]);

  if (!path || !url) return null;
  return (
    <figure className="space-y-1.5">
      {caption && <figcaption className="text-xs text-muted-foreground">{caption}</figcaption>}
      {/* eslint-disable-next-line @next/next/no-img-element -- local blob: URL, not optimisable by next/image */}
      <img src={url} alt={alt} className="max-h-80 w-auto max-w-full rounded-lg border border-border bg-white object-contain" />
    </figure>
  );
}
