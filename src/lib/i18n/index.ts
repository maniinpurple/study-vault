import type { Language } from "@/lib/constants";

import { en } from "./dictionaries/en";
import { vi, type Dictionary } from "./dictionaries/vi";

export type { Dictionary };

const dictionaries: Record<Language, Dictionary> = { VI: vi, EN: en };

export const DEFAULT_UI_LANGUAGE: Language = "VI";

export function getDictionary(language: Language = DEFAULT_UI_LANGUAGE): Dictionary {
  return dictionaries[language];
}

/** BCP-47 tag for <html lang> / Intl APIs. */
export const LOCALE_TAG: Record<Language, string> = { VI: "vi-VN", EN: "en-US" };

/** Replace `{name}` placeholders in a dictionary string. */
export function format(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

/** Resolve a dotted dictionary path such as `tags.base.concept_gap` (used by `AdaptiveTag.i18nKey`). Null when it is not a string leaf. */
export function resolveI18nKey(dictionary: Dictionary, key: string): string | null {
  let node: unknown = dictionary;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null || !(part in node)) return null;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : null;
}
