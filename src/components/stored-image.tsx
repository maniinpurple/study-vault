"use client";

import Image from "next/image";
import * as React from "react";

import { storedFileUrl } from "@/lib/files";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<typeof Image>, "src" | "alt" | "width" | "height" | "fill" | "loading" | "unoptimized" | "onError"> & {
  path: string | null;
  alt: string;
  /** Rendered when there is no path, or the file cannot be loaded. */
  fallback?: React.ReactNode;
  /** Fill a positioned (`relative`) parent that sets the size; use with `object-cover` / `object-contain`. */
  fill?: boolean;
};

/**
 * An image from the student's private storage, through `next/image` for native lazy loading (it loads only when it nears
 * the viewport) and async decoding. It is `unoptimized` on purpose: Next's optimizer would fetch the file without the
 * student's session and cache the result for everyone, so private files must be served as they are. They are cached by
 * the browser instead (`/api/files` sends an immutable private cache header, and a path never changes its bytes).
 *
 * Without `fill`, the image takes its natural size (the 1200×1200 hint only reserves space until it has loaded):
 * constrain it with `max-w-*` / `max-h-*` classes. With `fill`, the parent decides the size.
 */
export function StoredImage({ path, alt, fallback = null, fill = false, className, sizes, ...props }: Props) {
  const [loaded, setLoaded] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState<string | null>(null);
  if (!path || failed === path) return <>{fallback}</>;

  return (
    <Image
      {...props}
      src={storedFileUrl(path)}
      alt={alt}
      unoptimized
      loading="lazy"
      {...(fill ? { fill: true, sizes: sizes ?? "(max-width: 768px) 50vw, 400px" } : { width: 1200, height: 1200 })}
      onLoad={() => setLoaded(path)}
      onError={() => setFailed(path)}
      className={cn(!fill && "h-auto w-auto", loaded !== path && "animate-pulse bg-muted", className)}
    />
  );
}
