"use client";

import * as React from "react";

import { useActions } from "@/components/app-provider";
import { playModeSwitch, type SwitchOrigin } from "@/components/switch-effects";
import { THEME_ATTRIBUTE, type ThemePreference } from "@/lib/constants";

/**
 * Switch between Light and Dark with the circular reveal from the clicked control. Inside the view transition the DOM is switched
 * at once (`data-mode`, which is all the page's colors depend on); the account setting is saved right after, and the app's own
 * effect then writes the same value again.
 */
export function useModeSwitch() {
  const actions = useActions();
  return React.useCallback(
    (next: ThemePreference, origin?: SwitchOrigin) => {
      playModeSwitch(origin, () => {
        document.documentElement.dataset.mode = THEME_ATTRIBUTE[next];
        void actions.setTheme(next).catch(() => undefined);
      });
    },
    [actions],
  );
}
