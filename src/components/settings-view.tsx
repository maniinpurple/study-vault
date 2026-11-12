"use client";

import { useVault } from "@/components/app-provider";
import { ApiVault } from "@/components/api-vault";
import { CrosshairCard } from "@/components/crosshair-card";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Field, Select } from "@/components/ui/field";
import type { Language } from "@/lib/constants";

export function SettingsView() {
  const { t, user, actions } = useVault();

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t.settings.title}</h1>
        <p className="text-sm text-muted-foreground">{t.settings.subtitle}</p>
      </div>

      <CrosshairCard className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-4 sm:col-span-2">
          <h2 className="text-sm font-semibold">{t.settings.preferences}</h2>
        </div>
        <Field label={t.settings.defaultAiLanguage} htmlFor="default-ai-language" hint={t.settings.defaultAiLanguageHint}>
          <Select id="default-ai-language" value={user.defaultAiOutputLanguage} onChange={(e) => void actions.setDefaultAiLanguage(e.target.value as Language)}>
            <option value="VI">{t.language.VI}</option>
            <option value="EN">{t.language.EN}</option>
          </Select>
        </Field>
        <div className="space-y-1.5">
          <p className="text-xs font-medium">{t.theme.label}</p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><ThemeSwitcher />{t.theme[user.theme]}</div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs sm:col-span-2">
          <p className="font-medium">{t.settings.priorityTitle}</p>
          <p className="metric mt-1 text-muted-foreground">{t.settings.priority}</p>
        </div>
      </CrosshairCard>

      <ApiVault />
    </div>
  );
}
