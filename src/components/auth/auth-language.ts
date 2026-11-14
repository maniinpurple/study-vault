"use client";

import * as React from "react";

import { STORAGE_KEYS, type Language } from "@/lib/constants";
import { getDictionary } from "@/lib/i18n";

const EVENT = "vl:auth-language";

function read(): Language {
  try {
    const prefs = JSON.parse(localStorage.getItem(STORAGE_KEYS.prefs) ?? "null") as { lang?: string } | null;
    return prefs?.lang === "en" ? "EN" : "VI";
  } catch {
    return "VI";
  }
}

/**
 * Interface language on the signed-out pages: remembered on this device (the same `vl:prefs` the app reads), Vietnamese
 * by default. After sign-in the account's own language setting takes over.
 */
export function useAuthLanguage() {
  const subscribe = React.useCallback((notify: () => void) => {
    window.addEventListener(EVENT, notify);
    return () => window.removeEventListener(EVENT, notify);
  }, []);
  const language = React.useSyncExternalStore(subscribe, read, () => "VI" as Language);

  const setLanguage = React.useCallback((next: Language) => {
    const lang = next === "EN" ? "en" : "vi";
    try {
      const prefs = JSON.parse(localStorage.getItem(STORAGE_KEYS.prefs) ?? "null") as Record<string, unknown> | null;
      localStorage.setItem(STORAGE_KEYS.prefs, JSON.stringify({ ...(prefs ?? {}), lang }));
    } catch {
      /* storage unavailable */
    }
    document.documentElement.lang = lang;
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return { language, setLanguage, t: getDictionary(language) };
}
