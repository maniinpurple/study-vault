"use client";

import * as React from "react";

import { INITIAL_PAN_STATE, isPanActive, isPanKey, isSpaceKey, nextPanState, targetKeepsKey, type PanKeyMode, type PanKeyState } from "@/lib/pan-key";

/**
 * Whether the document viewer is in pan mode because of the pan key (Shift or Space), under the chosen behavior (hold or toggle).
 * Listens on the window while `enabled`. Switching the behavior starts from a clean state.
 */
export function usePanKey(mode: PanKeyMode, enabled: boolean): boolean {
  const [state, setState] = React.useState<{ mode: PanKeyMode; value: PanKeyState }>({ mode, value: INITIAL_PAN_STATE });
  // A state kept for another behavior counts for nothing: changing the setting resets pan mode.
  const value = state.mode === mode ? state.value : INITIAL_PAN_STATE;

  React.useEffect(() => {
    if (!enabled) return;
    const step = (event: Parameters<typeof nextPanState>[1]) => setState((prev) => ({ mode, value: nextPanState(prev.mode === mode ? prev.value : INITIAL_PAN_STATE, event, mode) }));
    const onDown = (e: KeyboardEvent) => {
      if (!isPanKey(e) || targetKeepsKey(e.target as HTMLElement | null, e)) return;
      // Space would also scroll the page.
      if (isSpaceKey(e)) e.preventDefault();
      if (!e.repeat) step({ type: "down" });
    };
    const onUp = (e: KeyboardEvent) => {
      if (isPanKey(e)) step({ type: "up" });
    };
    const onBlur = () => step({ type: "blur" });
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [mode, enabled]);

  return enabled && isPanActive(value, mode);
}
