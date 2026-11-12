"use client";

import { Shuffle } from "lucide-react";

import { useVault } from "@/components/app-provider";
import { MathText } from "@/components/math-text";
import type { RatingName } from "@/lib/fsrs";
import { format } from "@/lib/i18n";
import type { CardAttemptLog } from "@/lib/repo/types";
import { cn } from "@/lib/utils";

export const RATING_DOT: Record<RatingName, string> = {
  AGAIN: "bg-destructive",
  HARD: "bg-warning",
  GOOD: "bg-primary",
  EASY: "bg-chart-3",
};

/** Chronological attempt log: "Lần 1 → Lần 2 → Lần 3 …" with rating, date, time spent and the reflection note. */
export function AttemptLog({ attempts }: { attempts: readonly CardAttemptLog[] }) {
  const { t, locale, user } = useVault();
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: user.timezone });

  if (attempts.length === 0) return <p className="text-sm text-muted-foreground">{t.review.historyEmpty}</p>;

  return (
    <ol className="relative space-y-3 border-l border-border pl-4">
      {attempts.map((a) => (
        <li key={a.id} className="relative space-y-1">
          <span aria-hidden className={cn("absolute top-1.5 -left-[21px] size-2.5 rounded-full ring-4 ring-background", RATING_DOT[a.rating])} />
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span className="metric font-semibold text-foreground">{format(t.review.attemptNo, { n: a.attemptNumber })}</span>
            <span className="text-muted-foreground">{dateFmt.format(a.reviewedAt)}</span>
            <span className="font-medium">{t.review.ratings[a.rating]}</span>
            {a.timeSpentMs !== null && (
              <span className="metric text-muted-foreground">
                · {a.timeSpentMs < 90_000 ? format(t.review.seconds, { n: Math.round(a.timeSpentMs / 1000) }) : format(t.review.units.minute, { n: Math.round(a.timeSpentMs / 60_000) })}
              </span>
            )}
            {a.variantQuestionLatex && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Shuffle className="size-3" aria-hidden />
                {t.review.historyVariant}
              </span>
            )}
          </p>
          {a.note ? <MathText text={a.note} className="text-sm text-foreground/90" /> : <p className="text-xs text-muted-foreground/80 italic">{t.review.noNote}</p>}
        </li>
      ))}
    </ol>
  );
}
