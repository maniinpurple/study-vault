"use client";

import { motion } from "framer-motion";
import type * as React from "react";

import { useVault } from "@/components/app-provider";
import { useAppearance } from "@/components/use-appearance";
import { useStoredChoice } from "@/components/use-stored-choice";
import { ApiVault } from "@/components/api-vault";
import { Field, Select } from "@/components/ui/field";
import { ACCENT_PRESETS, NAV_LAYOUTS, THEME_STYLES, normalizeHex, type ThemeStyle } from "@/lib/appearance";
import { LANGUAGES, STORAGE_KEYS, THEME_ATTRIBUTE, THEME_CHOICES, type Language } from "@/lib/constants";
import { DEFAULT_PAN_KEY_MODE, PAN_KEY_MODES } from "@/lib/pan-key";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** A settings group: title and hint on the left, controls on the right, separated by a hairline. */
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-4 border-t-2 border-dashed border-border py-8 md:grid-cols-[14rem_minmax(0,1fr)]">
      <div className="space-y-1">
        <h2 className="text-heading">{title}</h2>
        {hint && <p className="text-caption text-muted-foreground">{hint}</p>}
      </div>
      <div className="min-w-0 space-y-5">{children}</div>
    </section>
  );
}

/** Segmented control whose thumb slides between options (shared layout). */
function Segmented<T extends string>({ id, label, value, options, onChange }: { id: string; label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-muted p-0.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button key={option.value} type="button" role="radio" aria-checked={active} onClick={() => onChange(option.value)} className={cn("relative h-8 min-w-20 rounded-md px-3 text-sm transition-colors", active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {active && <motion.span layoutId={`${id}-thumb`} transition={spring.snappy} className="absolute inset-0 rounded-md border-2 border-border bg-card shadow-xs" aria-hidden />}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}


/**
 * One theme choice with a live preview. The tile re-declares `data-theme` / `data-mode` on itself, so every token inside it resolves to
 * that theme (palette, outline, radius, shadow, paper) while the accent is inherited from the page: you see exactly what you will get.
 */
function ThemeOption({ style, mode, selected, label, description, onSelect }: { style: ThemeStyle; mode: "light" | "dark"; selected: boolean; label: string; description: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn("group flex flex-col gap-2 rounded-lg p-1.5 text-left outline-offset-2 transition-colors", selected ? "bg-accent" : "hover:bg-muted")}
    >
      <span
        aria-hidden
        data-theme={style}
        data-mode={mode}
        className="block overflow-hidden rounded-lg border-2 border-border bg-background text-foreground shadow-sm"
        style={{ backgroundImage: "var(--paper-image)", backgroundSize: "var(--paper-size)" }}
      >
        <span className="flex items-center gap-1 border-b-2 border-border bg-sunken px-2 py-1.5">
          <span className="size-1.5 rounded-full bg-foreground" />
          <span className="size-1.5 rounded-full bg-foreground/50" />
          <span className="size-1.5 rounded-full bg-foreground/25" />
        </span>
        <span className="block space-y-2 p-2.5">
          <span className="block h-1.5 w-3/4 rounded-full bg-foreground/70" />
          <span className="block h-1.5 w-1/2 rounded-full bg-foreground/35" />
          <span className="flex gap-1.5 pt-0.5">
            <span className="block h-4 w-9 rounded-md border-2 border-border bg-primary shadow-xs" />
            <span className="block h-4 w-9 rounded-md border-2 border-input bg-card" />
          </span>
        </span>
      </span>
      <span className="px-0.5">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-caption text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

/** Preset swatches plus one native colour input. The chosen colour is also written out, so it never relies on sight alone. */
function AccentPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const { t } = useVault();
  const preset = ACCENT_PRESETS.find((candidate) => candidate.hex === value);
  const swatch = "size-9 rounded-full border-2 border-input outline-offset-2 transition-shadow";
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div role="radiogroup" aria-label={t.appearance.accentLabel} className="flex flex-wrap items-center gap-2.5">
        {ACCENT_PRESETS.map((candidate) => {
          const selected = candidate.hex === value;
          return (
            <button
              key={candidate.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={t.appearance.colors[candidate.id]}
              title={t.appearance.colors[candidate.id]}
              onClick={() => onChange(candidate.hex)}
              className={cn(swatch, selected && "ring-2 ring-foreground ring-offset-2 ring-offset-background")}
              style={{ backgroundColor: candidate.hex }}
            />
          );
        })}
        <label
          title={t.appearance.customColor}
          className={cn(swatch, "relative grid cursor-pointer place-items-center overflow-hidden has-focus-visible:outline-3 has-focus-visible:outline-ring", !preset && "ring-2 ring-foreground ring-offset-2 ring-offset-background")}
          style={{ backgroundColor: value }}
        >
          <span className="sr-only">{t.appearance.customColor}</span>
          <input type="color" value={value} onChange={(event) => onChange(normalizeHex(event.target.value) ?? value)} className="absolute inset-0 size-full cursor-pointer opacity-0" />
        </label>
      </div>
      <code className="rounded-md bg-muted px-2 py-1 font-mono text-caption uppercase">{value}</code>
    </div>
  );
}

export function SettingsView() {
  const { t, user, actions } = useVault();
  const mode = THEME_ATTRIBUTE[user.theme];
  const theme = THEME_CHOICES.find((choice) => choice.mode === mode) ?? THEME_CHOICES[0];
  const { style, setStyle, accent, setAccent, layout, setLayout } = useAppearance();
  const [panKey, setPanKey] = useStoredChoice(STORAGE_KEYS.panKey, PAN_KEY_MODES, DEFAULT_PAN_KEY_MODE);

  return (
    <div className="mx-auto max-w-4xl">
      <header className="space-y-1.5 pb-8">
        <h1 className="text-display">{t.settings.title}</h1>
        <p className="text-muted-foreground">{t.settings.subtitle}</p>
      </header>

      <Section title={t.settings.appearance} hint={t.settings.appearanceHint}>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t.appearance.styleLabel}</p>
          <p className="text-caption text-muted-foreground">{t.appearance.styleHint}</p>
          <div role="radiogroup" aria-label={t.appearance.styleLabel} className="grid grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-4">
            {THEME_STYLES.map((option) => (
              <ThemeOption key={option} style={option} mode={mode} selected={style === option} label={t.appearance.styles[option]} description={t.appearance.styleDescriptions[option]} onSelect={() => setStyle(option)} />
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t.appearance.accentLabel}</p>
          <p className="text-caption text-muted-foreground">{t.appearance.accentHint}</p>
          <AccentPicker value={accent} onChange={setAccent} />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t.appearance.layoutLabel}</p>
          <Segmented id="layout" label={t.appearance.layoutLabel} value={layout} options={NAV_LAYOUTS.map((option) => ({ value: option, label: t.appearance.layouts[option] }))} onChange={setLayout} />
          <p className="text-caption text-muted-foreground">{t.appearance.layoutHint}</p>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t.appearance.modeLabel}</p>
          <Segmented id="theme" label={t.appearance.modeLabel} value={theme.value} options={THEME_CHOICES.map((choice) => ({ value: choice.value, label: t.theme[choice.value] }))} onChange={(value) => void actions.setTheme(value)} />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t.header.language}</p>
          <Segmented id="language" label={t.header.language} value={user.uiLanguage} options={LANGUAGES.map((language) => ({ value: language, label: t.language[language] }))} onChange={(value) => void actions.setUiLanguage(value)} />
        </div>
        <p className="text-caption text-subtle">{t.appearance.deviceNote}</p>
      </Section>

      <Section title={t.controls.title} hint={t.controls.hint}>
        <div className="space-y-2">
          <p className="text-sm font-medium">{t.controls.panKey}</p>
          <p className="text-caption text-muted-foreground">{t.controls.panKeyHint}</p>
          <Segmented id="pan-key" label={t.controls.panKey} value={panKey} options={PAN_KEY_MODES.map((mode) => ({ value: mode, label: t.controls[mode] }))} onChange={setPanKey} />
          <p className="text-caption text-muted-foreground">{panKey === "hold" ? t.controls.holdHint : t.controls.toggleHint}</p>
        </div>
        <p className="text-caption text-subtle">{t.appearance.deviceNote}</p>
      </Section>

      <Section title={t.settings.aiTitle} hint={`${t.settings.priorityTitle}: ${t.settings.priority}`}>
        <Field label={t.settings.defaultAiLanguage} htmlFor="default-ai-language" hint={t.settings.defaultAiLanguageHint} className="max-w-xs">
          <Select id="default-ai-language" value={user.defaultAiOutputLanguage} onChange={(e) => void actions.setDefaultAiLanguage(e.target.value as Language)}>
            <option value="VI">{t.language.VI}</option>
            <option value="EN">{t.language.EN}</option>
          </Select>
        </Field>
      </Section>

      <div className="border-t-2 border-dashed border-border pt-8">
        <ApiVault />
      </div>
    </div>
  );
}
