"use client";

import { Moon, Sun } from "lucide-react";

import { useApp } from "@/components/app-provider";
import { Button } from "@/components/ui/button";
import { DEFAULT_THEME, THEME_ATTRIBUTE, THEME_CHOICES } from "@/lib/constants";

/** Light / Dark toggle (DESIGN_SYSTEM.md §2). The icon shows the theme you would switch to. */
export function ThemeSwitcher() {
  const { snapshot, t, actions } = useApp();
  const mode = THEME_ATTRIBUTE[snapshot?.user.theme ?? DEFAULT_THEME];
  const next = THEME_CHOICES.find((choice) => choice.mode !== mode) ?? THEME_CHOICES[0];
  const label = next.mode === "dark" ? t.theme.switchToDark : t.theme.switchToLight;

  return (
    <Button variant="ghost" size="icon" onClick={() => void actions.setTheme(next.value)} aria-label={label} title={label}>
      {next.mode === "dark" ? <Moon /> : <Sun />}
    </Button>
  );
}
