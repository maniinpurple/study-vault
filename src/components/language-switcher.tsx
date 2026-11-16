"use client";

import { useApp } from "@/components/app-provider";
import { playLanguageSwitch } from "@/components/switch-effects";
import { LANGUAGES } from "@/lib/constants";
import { cn } from "@/lib/utils";

/** `VI / EN` GUI-language toggle. (AI output language is a separate setting.) */
export function LanguageSwitcher() {
  const { snapshot, t, actions } = useApp();
  const current = snapshot?.user.uiLanguage ?? "VI";

  return (
    <div role="radiogroup" aria-label={t.header.language} className="flex rounded-full border border-border bg-muted/50 p-0.5">
      {LANGUAGES.map((language) => (
        <button
          key={language}
          type="button"
          role="radio"
          aria-checked={language === current}
          title={t.language[language]}
          onClick={(e) => {
            if (language === current) return;
            // A shockwave from this button; the language changes as it leaves.
            playLanguageSwitch(e.currentTarget, () => void actions.setUiLanguage(language));
          }}
          className={cn(
            "tabular-nums rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
            language === current ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {language}
        </button>
      ))}
    </div>
  );
}
