"use client";

import { motion } from "framer-motion";
import type * as React from "react";

import { useVault } from "@/components/app-provider";
import { ApiVault } from "@/components/api-vault";
import { Field, Select } from "@/components/ui/field";
import { LANGUAGES, THEME_ATTRIBUTE, THEME_CHOICES, type Language } from "@/lib/constants";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** A settings group: title and hint on the left, controls on the right, separated by a hairline. */
function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-4 border-t border-border py-8 md:grid-cols-[14rem_minmax(0,1fr)]">
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
            {active && <motion.span layoutId={`${id}-thumb`} transition={spring.snappy} className="absolute inset-0 rounded-md bg-card shadow-xs" aria-hidden />}
            <span className="relative">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SettingsView() {
  const { t, user, actions } = useVault();
  const mode = THEME_ATTRIBUTE[user.theme];
  const theme = THEME_CHOICES.find((choice) => choice.mode === mode) ?? THEME_CHOICES[0];

  return (
    <div className="mx-auto max-w-4xl">
      <header className="space-y-1.5 pb-8">
        <h1 className="text-display">{t.settings.title}</h1>
        <p className="text-muted-foreground">{t.settings.subtitle}</p>
      </header>

      <Section title={t.settings.appearance} hint={t.settings.appearanceHint}>
        <div className="space-y-1.5">
          <p className="text-xs font-medium">{t.theme.label}</p>
          <Segmented id="theme" label={t.theme.label} value={theme.value} options={THEME_CHOICES.map((choice) => ({ value: choice.value, label: t.theme[choice.value] }))} onChange={(value) => void actions.setTheme(value)} />
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-medium">{t.header.language}</p>
          <Segmented id="language" label={t.header.language} value={user.uiLanguage} options={LANGUAGES.map((language) => ({ value: language, label: t.language[language] }))} onChange={(value) => void actions.setUiLanguage(value)} />
        </div>
      </Section>

      <Section title={t.settings.aiTitle} hint={`${t.settings.priorityTitle}: ${t.settings.priority}`}>
        <Field label={t.settings.defaultAiLanguage} htmlFor="default-ai-language" hint={t.settings.defaultAiLanguageHint} className="max-w-xs">
          <Select id="default-ai-language" value={user.defaultAiOutputLanguage} onChange={(e) => void actions.setDefaultAiLanguage(e.target.value as Language)}>
            <option value="VI">{t.language.VI}</option>
            <option value="EN">{t.language.EN}</option>
          </Select>
        </Field>
      </Section>

      <div className="border-t border-border pt-8">
        <ApiVault />
      </div>
    </div>
  );
}
