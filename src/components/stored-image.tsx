"use client";

import * as React from "react";

import { useVault } from "@/components/app-provider";
import { useObjectUrl } from "@/components/use-object-url";
import { cn } from "@/lib/utils";

/** An image kept in local storage, addressed by its path. Reserves its box while loading; renders `fallback` when missing. */
export function StoredImage({ path, alt, className, fallback = null, ...props }: { path: string | null; alt: string; fallback?: React.ReactNode } & Omit<React.ComponentProps<"img">, "src" | "alt">) {
  const { actions } = useVault();
  const [loaded, setLoaded] = React.useState<{ path: string; blob: Blob | null } | null>(null);
  const current = loaded && loaded.path === path ? loaded : null;
  const url = useObjectUrl(current?.blob ?? null);

  React.useEffect(() => {
    if (!path) return;
    let cancelled = false;
    actions
      .getBlob(path)
      .then((blob) => !cancelled && setLoaded({ path, blob }))
      .catch(() => !cancelled && setLoaded({ path, blob: null }));
    return () => {
      cancelled = true;
    };
  }, [actions, path]);

  if (!path || (current && !current.blob)) return <>{fallback}</>;
  if (!url) return <div aria-hidden className={cn("min-h-16 animate-pulse rounded-md bg-muted", className)} />;
  // eslint-disable-next-line @next/next/no-img-element -- local blob: URL, not optimisable by next/image
  return <img src={url} alt={alt} className={className} {...props} />;
}
