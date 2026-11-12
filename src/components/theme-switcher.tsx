"use client";

import { Check, Moon, Sun, SunMoon } from "lucide-react";

import { useApp } from "@/components/app-provider";
import { Dropdown, MenuItem } from "@/components/dropdown";
import { Button } from "@/components/ui/button";
import { THEMES, type ThemePreference } from "@/lib/constants";

const ICON: Record<ThemePreference, typeof Moon> = { OBSIDIAN: Moon, DARK_GRAY: SunMoon, LIGHT: Sun };
const SWATCH: Record<ThemePreference, string> = { OBSIDIAN: "#030014", DARK_GRAY: "#0f0f11", LIGHT: "#fafafa" };

export function ThemeSwitcher() {
  const { snapshot, t, actions } = useApp();
  const current = snapshot?.user.theme ?? "OBSIDIAN";
  const Icon = ICON[current];

  return (
    <Dropdown
      trigger={({ open, toggle, id }) => (
        <Button variant="ghost" size="icon" onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} aria-label={`${t.theme.label}: ${t.theme[current]}`} title={t.theme.label}>
          <Icon />
        </Button>
      )}
    >
      {(close) => (
        <div role="menu" aria-label={t.theme.label}>
          {THEMES.map((theme) => (
            <MenuItem
              key={theme}
              role="menuitemradio"
              aria-checked={theme === current}
              active={theme === current}
              onClick={() => {
                close();
                void actions.setTheme(theme);
              }}
            >
              <span className="size-4 rounded-full border border-border" style={{ backgroundColor: SWATCH[theme] }} aria-hidden />
              <span className="flex-1">{t.theme[theme]}</span>
              {theme === current && <Check className="size-4" aria-hidden />}
            </MenuItem>
          ))}
        </div>
      )}
    </Dropdown>
  );
}
