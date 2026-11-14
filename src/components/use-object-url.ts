"use client";

import * as React from "react";

/** One shared object URL per Blob, reference-counted so it is revoked when the last consumer unmounts. */
const registry = new Map<Blob, { url: string; refs: number }>();

/** Object URL for a Blob (null until subscribed / when `blob` is null). Safe under React Strict Mode's mount-unmount-mount. */
export function useObjectUrl(blob: Blob | null): string | null {
  const subscribe = React.useCallback(
    (notify: () => void) => {
      if (!blob) return () => {};
      const entry = registry.get(blob) ?? { url: URL.createObjectURL(blob), refs: 0 };
      registry.set(blob, entry);
      entry.refs++;
      notify();
      return () => {
        entry.refs--;
        if (entry.refs === 0) {
          URL.revokeObjectURL(entry.url);
          registry.delete(blob);
        }
      };
    },
    [blob],
  );
  return React.useSyncExternalStore(
    subscribe,
    () => (blob ? (registry.get(blob)?.url ?? null) : null),
    () => null,
  );
}
