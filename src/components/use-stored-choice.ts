"use client";

import * as React from "react";

const EVENT = "vl:stored-choice";

/**
 * One of a fixed set of string values kept in localStorage (a per-device preference such as the vault view).
 * The server and the first client render use `fallback`; the saved value applies right after hydration.
 */
export function useStoredChoice<T extends string>(key: string, allowed: readonly T[], fallback: T): [T, (next: T) => void] {
  const subscribe = React.useCallback((notify: () => void) => {
    window.addEventListener(EVENT, notify);
    window.addEventListener("storage", notify);
    return () => {
      window.removeEventListener(EVENT, notify);
      window.removeEventListener("storage", notify);
    };
  }, []);
  const read = React.useCallback((): T => {
    try {
      const stored = localStorage.getItem(key);
      return allowed.find((value) => value === stored) ?? fallback;
    } catch {
      return fallback;
    }
  }, [key, allowed, fallback]);
  const value = React.useSyncExternalStore(subscribe, read, () => fallback);
  const set = React.useCallback(
    (next: T) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        /* storage unavailable: the choice lasts until reload */
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}
