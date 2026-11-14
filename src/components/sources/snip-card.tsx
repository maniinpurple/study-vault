"use client";

import { Flag, Loader2, Trash2 } from "lucide-react";
import * as React from "react";

import { useVault } from "@/components/app-provider";
import { MathText } from "@/components/math-text";
import { ProblemFields } from "@/components/problems/problem-fields";
import { StoredImage } from "@/components/stored-image";
import { Button } from "@/components/ui/button";
import { aiLanguageFor, pickAiKey } from "@/lib/ai-keys";
import { format } from "@/lib/i18n";
import { OcrRequestError, requestOcr } from "@/lib/ocr-client";
import type { MistakeCard } from "@/lib/repo/types";
import { blobToBase64 } from "@/lib/scan-source";
import { cn } from "@/lib/utils";

interface Props {
  card: MistakeCard;
  number: number;
  selected: boolean;
  /** The crop is still flying in from the page: keep its slot but hide the image. */
  landing: boolean;
  onSelect(): void;
  onDelete(): void;
}

/** One snipped problem: its image, tags, solution and takeaway in a single card that saves itself. */
export function SnipCard({ card, number, selected, landing, onSelect, onDelete }: Props) {
  const { snapshot, user, t, actions } = useVault();
  const [showImage, setShowImage] = React.useState(false);
  const [converting, setConverting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const subject = snapshot.subjects.find((s) => s.id === card.subjectId) ?? null;
  const key = pickAiKey(snapshot.apiKeys, subject);
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
        <button type="button" onClick={onSelect} title={card.sourcePage ? format(t.sources.tray.goToPage, { n: card.sourcePage }) : undefined} className="flex min-w-0 flex-1 items-baseline gap-2 rounded-sm text-left">
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
        <Button variant="ghost" size="icon-sm" aria-label={t.problem.delete} title={t.problem.delete} onClick={onDelete}>
          <Trash2 />
        </Button>
      </header>

      <div className="border-y border-border bg-white">
        {hasText && !showImage ? (
          <MathText text={card.questionLatex} className="bg-card p-3 text-reading" />
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
        <ProblemFields card={card} />
      </div>
    </article>
  );
}
