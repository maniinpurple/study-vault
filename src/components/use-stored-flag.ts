"use client";

import * as React from "react";

const EVENT = "vl:stored-flag";

/** A boolean kept in localStorage (small per-device preference, e.g. the collapsed sidebar). False on the server. */
export function useStoredFlag(key: string): [boolean, (next: boolean) => void] {
  const subscribe = React.useCallback((notify: () => void) => {
    window.addEventListener(EVENT, notify);
    window.addEventListener("storage", notify);
    return () => {
      window.removeEventListener(EVENT, notify);
      window.removeEventListener("storage", notify);
    };
  }, []);
  const read = React.useCallback(() => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  }, [key]);
  const value = React.useSyncExternalStore(subscribe, read, () => false);
  const set = React.useCallback(
    (next: boolean) => {
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* storage unavailable */
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}
