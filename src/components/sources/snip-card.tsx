"use client";

import { Flag, Loader2, Trash2 } from "lucide-react";
import * as React from "react";

import { useActions, useI18n } from "@/components/app-provider";
import { MarkdownMath } from "@/components/markdown-math";
import { AutosaveField, ProblemFields } from "@/components/problems/problem-fields";
import { StoredImage } from "@/components/stored-image";
import { Button } from "@/components/ui/button";
import { aiLanguageFor } from "@/lib/ai-keys";
import { format } from "@/lib/i18n";
import { OcrRequestError, requestOcr } from "@/lib/ocr-client";
import type { MistakeCard, Subject, User, UserApiKey } from "@/lib/repo/types";
import { blobToBase64 } from "@/lib/scan-source";
import { cn } from "@/lib/utils";

interface Props {
  card: MistakeCard;
  number: number;
  selected: boolean;
  /** The crop is still flying in from the page: keep its slot but hide the image. */
  landing: boolean;
  /** The card's own subject, the API key the AI skills would use for it, and the account: passed in, not read from the app
   *  state, so this card is not re-rendered by changes elsewhere in the snapshot. */
  subject: Subject | null;
  aiKey: UserApiKey | null;
  user: User;
  /** Stable callbacks that take the card's id: a new closure per card per render would defeat the memo. */
  onSelect(id: string, page: number | null): void;
  onDelete(id: string): void;
}

/**
 * One snipped problem: its image, tags, solution and takeaway in a single card that saves itself.
 * Memoized: rendering the question (Markdown + KaTeX) is the expensive part of the tray, so a card re-renders only when its own
 * data, selection or props change.
 */
export const SnipCard = React.memo(function SnipCard({ card, number, selected, landing, subject, aiKey: key, user, onSelect, onDelete }: Props) {
  const { t } = useI18n();
  const actions = useActions();
  const [showImage, setShowImage] = React.useState(false);
  /** What is being typed in the editor, so the preview follows every keystroke (the card itself updates after a pause). */
  const [draftText, setDraftText] = React.useState<string | null>(null);
  const [converting, setConverting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const hasText = card.questionLatex.trim().length > 0;

  async function convert() {
    if (!key || !card.originalCropPath) return;
    setConverting(true);
    setError(null);
    try {
      const blob = await actions.getBlob(card.originalCropPath);
      if (!blob) throw new OcrRequestError("UNKNOWN");
      const result = await requestOcr({ keyId: key.id, language: aiLanguageFor(subject, key, user), imageBase64: await blobToBase64(blob) });
      await actions.updateCard(card.id, { questionLatex: result.markdown, ocrStatus: "DONE", ocrModel: result.model, ocrConfidence: result.confidence, ocrRawText: result.markdown });
    } catch (err) {
      const code = err instanceof OcrRequestError ? err.code : "UNKNOWN";
      setError((t.ai.errors as Record<string, string>)[code] ?? t.ai.errors.UNKNOWN);
    } finally {
      setConverting(false);
    }
  }

  return (
    <article
      data-snip-card={card.id}
      aria-label={format(t.problem.label, { n: number })}
      className={cn("overflow-hidden rounded-lg border bg-card shadow-xs transition-[border-color,box-shadow]", selected ? "border-brand shadow-sm" : "border-border")}
    >
      <header className="flex items-center gap-1 py-1.5 pr-1.5 pl-3">
        <button type="button" onClick={() => onSelect(card.id, card.sourcePage)} title={card.sourcePage ? format(t.sources.tray.goToPage, { n: card.sourcePage }) : undefined} className="flex min-w-0 flex-1 items-baseline gap-2 rounded-sm text-left">
          <span className="text-heading tabular-nums">{format(t.problem.label, { n: number })}</span>
          {card.sourcePage !== null && <span className="text-caption text-subtle tabular-nums">{format(t.problem.pageShort, { n: card.sourcePage })}</span>}
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-pressed={card.isHighYield}
          aria-label={card.isHighYield ? t.problem.unmarkPriority : t.problem.markPriority}
          title={card.isHighYield ? t.problem.unmarkPriority : t.problem.markPriority}
          onClick={() => void actions.updateCard(card.id, { isHighYield: !card.isHighYield })}
          className={cn(card.isHighYield && "bg-mark-soft text-mark-foreground hover:bg-mark-soft")}
        >
          <Flag />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={t.problem.delete} title={t.problem.delete} onClick={() => onDelete(card.id)}>
          <Trash2 />
        </Button>
      </header>

      <div className="border-y border-border bg-white">
        {hasText && !showImage ? (
          <MarkdownMath text={draftText ?? card.questionLatex} className="bg-card p-3" />
        ) : (
          <StoredImage data-snip-image={card.id} path={card.originalCropPath} alt={t.problem.imageAlt} className={cn("mx-auto block max-h-80 w-auto max-w-full", landing && "opacity-0")} />
        )}
      </div>

      <div className="space-y-3 p-3">
        {card.originalCropPath && (
          <div className="flex flex-wrap items-center gap-2">
            {hasText ? (
              <Button variant="ghost" size="sm" onClick={() => setShowImage((v) => !v)}>
                {showImage ? t.problem.showText : t.problem.showImage}
              </Button>
            ) : (
              <Button variant="outline" size="sm" disabled={!key || converting} onClick={() => void convert()} title={key ? undefined : t.problem.toTextNeedsKey}>
                {converting && <Loader2 className="animate-spin" />}
                {converting ? t.problem.toTextBusy : t.problem.toText}
              </Button>
            )}
            {hasText && card.ocrStatus === "DONE" && <span className="text-caption text-subtle">{t.problem.textFromAi}</span>}
          </div>
        )}
        {error && (
          <p role="alert" className="text-caption text-destructive">
            {error}
          </p>
        )}
        {hasText && (
          <AutosaveField
            key={`${card.id}:text`}
            label={t.problem.editText}
            hint={t.problem.editTextHint}
            value={card.questionLatex}
            rows={4}
            mono
            onChange={setDraftText}
            onSave={(text) => actions.updateCard(card.id, { questionLatex: text })}
          />
        )}
        <ProblemFields card={card} />
      </div>
    </article>
  );
});
