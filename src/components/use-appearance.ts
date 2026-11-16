"use client";

import * as React from "react";

import {
  APPEARANCE_KEYS,
  DEFAULT_ACCENT,
  DEFAULT_LAYOUT,
  DEFAULT_STYLE,
  NAV_LAYOUTS,
  UI_MODES,
  DEFAULT_UI_MODE,
  THEME_STYLES,
  accentCss,
  deriveAccentVars,
  isHexColor,
  normalizeHex,
  type NavLayout,
  type ThemeStyle,
  type UiMode,
} from "@/lib/appearance";
import { useStoredChoice } from "@/components/use-stored-choice";

const ACCENT_EVENT = "vl:accent";

function readAccent(): string {
  try {
    const stored = localStorage.getItem(APPEARANCE_KEYS.accent);
    return isHexColor(stored) ? stored : DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

function subscribeAccent(notify: () => void) {
  window.addEventListener(ACCENT_EVENT, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(ACCENT_EVENT, notify);
    window.removeEventListener("storage", notify);
  };
}

/**
 * The three per-device appearance choices (DESIGN_SYSTEM.md §2.5): style, accent colour and navigation layout, each persisted in
 * localStorage. Changing one only stores it; `useApplyAppearance` (mounted once in the app shell) reflects it on <html>.
 */
export function useAppearance() {
  const [style, setStyle] = useStoredChoice<ThemeStyle>(APPEARANCE_KEYS.style, THEME_STYLES, DEFAULT_STYLE);
  const [layout, setLayout] = useStoredChoice<NavLayout>(APPEARANCE_KEYS.layout, NAV_LAYOUTS, DEFAULT_LAYOUT);
  const [uiMode, setUiMode] = useStoredChoice<UiMode>(APPEARANCE_KEYS.uiMode, UI_MODES, DEFAULT_UI_MODE);
  const accent = React.useSyncExternalStore(subscribeAccent, readAccent, () => DEFAULT_ACCENT);

  const setAccent = React.useCallback((next: string) => {
    const hex = normalizeHex(next);
    if (!hex) return;
    try {
      localStorage.setItem(APPEARANCE_KEYS.accent, hex);
      // The derived tokens are stored too, so the pre-hydration script can apply them with no colour maths.
      localStorage.setItem(APPEARANCE_KEYS.accentVars, JSON.stringify(deriveAccentVars(hex)));
    } catch {
      /* storage unavailable: the accent lasts until reload */
    }
    window.dispatchEvent(new Event(ACCENT_EVENT));
  }, []);

  return { style, setStyle, layout, setLayout, uiMode, setUiMode, accent, setAccent };
}

/** Mirrors the stored choices onto <html>: `data-theme`, `data-layout` and the `#vl-accent` stylesheet. Mount once. */
export function useApplyAppearance() {
  const { style, layout, uiMode, accent } = useAppearance();

  React.useEffect(() => {
    document.documentElement.dataset.theme = style;
  }, [style]);

  React.useEffect(() => {
    document.documentElement.dataset.layout = layout;
  }, [layout]);

  React.useEffect(() => {
    document.documentElement.dataset.uiMode = uiMode;
  }, [uiMode]);

  React.useEffect(() => {
    let element = document.getElementById("vl-accent");
    if (accent === DEFAULT_ACCENT) {
      // The default blue lives in globals.css; no override needed.
      element?.remove();
      return;
    }
    if (!element) {
      element = document.createElement("style");
      element.id = "vl-accent";
      document.head.appendChild(element);
    }
    element.textContent = accentCss(deriveAccentVars(accent));
  }, [accent]);
}
