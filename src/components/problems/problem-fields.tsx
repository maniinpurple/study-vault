"use client";

import { Check } from "lucide-react";
import * as React from "react";

import { useVault } from "@/components/app-provider";
import { swatchColor } from "@/lib/constants";
import type { MistakeCard } from "@/lib/repo/types";
import { tagDisplayName, tagsForSubject } from "@/lib/tags";
import { cn } from "@/lib/utils";

const SAVE_DELAY_MS = 700;

/** Error-tag toggles for a problem. Saves on every toggle. */
export function TagChips({ card }: { card: MistakeCard }) {
  const { snapshot, t, actions } = useVault();
  const tags = tagsForSubject(snapshot.tags, card.subjectId);
  const active = new Set(snapshot.cardTags.filter((link) => link.cardId === card.id).map((link) => link.tagId));
  if (tags.length === 0) return null;

  function toggle(tagId: string) {
    const next = new Set(active);
    if (next.has(tagId)) next.delete(tagId);
    else next.add(tagId);
    void actions.setCardTags(card.id, [...next]).catch(() => undefined);
  }

  return (
    <div role="group" aria-label={t.problem.tags} className="flex flex-wrap gap-1.5">
      {tags.map((tag) => {
        const on = active.has(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(tag.id)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-caption transition-colors",
              on ? "border-transparent bg-accent font-medium text-accent-foreground" : "border-border text-muted-foreground hover:border-border-strong hover:text-foreground",
            )}
          >
            <span className="size-1.5 rounded-full" style={{ backgroundColor: swatchColor(tag.color) ?? "var(--subtle-foreground)" }} aria-hidden />
            {tagDisplayName(t, tag)}
            {on && <Check className="size-3" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A quiet inline editor that saves itself: after a pause in typing, on blur and on unmount.
 * Mount it keyed by the record it edits; it does not follow later changes to `value`.
 */
export function AutosaveField({ label, value, placeholder, onSave, onChange, hint, rows = 2, mono = false }: { label: string; value: string; placeholder?: string; onSave: (value: string) => Promise<unknown>; /** Called with every keystroke, e.g. to drive a live preview. */ onChange?: (value: string) => void; hint?: string; rows?: number; mono?: boolean }) {
  const { t } = useVault();
  const id = React.useId();
  const [draft, setDraft] = React.useState(value);
  const [state, setState] = React.useState<"idle" | "saving" | "saved">("idle");
  const latest = React.useRef({ draft: value, saved: value, onSave });
  const timer = React.useRef<number | null>(null);

  React.useEffect(() => {
    latest.current.onSave = onSave;
  });

  const flush = React.useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    const { draft: text, saved, onSave: save } = latest.current;
    if (text === saved) return;
    latest.current.saved = text;
    setState("saving");
    save(text).then(
      () => setState("saved"),
      () => setState("idle"),
    );
  }, []);

  // Flush a pending edit when the editor goes away (card removed, dialog closed).
  React.useEffect(() => flush, [flush]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-caption font-medium text-muted-foreground">
          {label}
        </label>
        <span aria-live="polite" className="text-caption text-subtle">
          {state === "saving" ? t.common.saving : state === "saved" ? t.common.saved : ""}
        </span>
      </div>
      <textarea
        id={id}
        value={draft}
        rows={rows}
        placeholder={placeholder}
        spellCheck={!mono}
        onChange={(e) => {
          setDraft(e.target.value);
          latest.current.draft = e.target.value;
          onChange?.(e.target.value);
          setState("idle");
          if (timer.current !== null) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(flush, SAVE_DELAY_MS);
        }}
        onBlur={flush}
        className={cn(
          "field-sizing-content block max-h-64 min-h-[3.25rem] w-full resize-none rounded-md bg-muted px-2.5 py-2 text-sm leading-relaxed text-foreground transition-colors placeholder:text-subtle hover:bg-secondary focus-visible:bg-secondary",
          mono && "font-mono text-[13px]",
        )}
      />
      {hint && <p className="text-caption text-subtle">{hint}</p>}
    </div>
  );
}

/** Tags, solution and takeaway of a problem, kept together and saved in place. */
export function ProblemFields({ card }: { card: MistakeCard }) {
  const { t, actions } = useVault();
  return (
    <div className="space-y-3">
      <TagChips card={card} />
      <AutosaveField label={t.problem.solution} value={card.solutionLatex ?? ""} placeholder={t.problem.solutionPlaceholder} onSave={(text) => actions.updateCard(card.id, { solutionLatex: text })} />
      <AutosaveField label={t.problem.takeaway} value={card.ahaNote ?? ""} placeholder={t.problem.takeawayPlaceholder} onSave={(text) => actions.updateCard(card.id, { ahaNote: text })} />
    </div>
  );
}
