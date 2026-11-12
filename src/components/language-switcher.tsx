"use client";

import { useApp } from "@/components/app-provider";
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
          onClick={() => void actions.setUiLanguage(language)}
          className={cn(
            "metric rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
            language === current ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {language}
        </button>
      ))}
    </div>
  );
}
