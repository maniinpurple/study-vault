"use client";

import { Flag, Pencil } from "lucide-react";

import { useVault } from "@/components/app-provider";
import { MathText } from "@/components/math-text";
import { StoredImage } from "@/components/stored-image";
import { Button } from "@/components/ui/button";
import { swatchColor } from "@/lib/constants";
import { format } from "@/lib/i18n";
import type { ReviewStatus } from "@/lib/problems";
import type { MistakeCard } from "@/lib/repo/types";
import { tagDisplayName } from "@/lib/tags";
import { cn } from "@/lib/utils";

const STATUS_DOT: Record<ReviewStatus, string> = { due: "bg-destructive", new: "bg-brand", learning: "bg-warning", scheduled: "bg-subtle", mastered: "bg-success" };

interface ViewProps {
  card: MistakeCard;
  status: ReviewStatus;
  onEdit: () => void;
}

/** What the three views share: the problem's subject, source, topic and tags. */
function useProblemContext(card: MistakeCard) {
  const { snapshot, t } = useVault();
  const subject = snapshot.subjects.find((s) => s.id === card.subjectId);
  const source = card.examUploadId ? snapshot.examUploads.find((u) => u.id === card.examUploadId) : null;
  const topic = card.topicId ? snapshot.topics.find((tp) => tp.id === card.topicId) : null;
  const tagIds = new Set(snapshot.cardTags.filter((l) => l.cardId === card.id).map((l) => l.tagId));
  const tags = snapshot.tags.filter((tag) => tagIds.has(tag.id));
  return { t, subject, source, topic, tags, hasText: card.questionLatex.trim().length > 0 };
}

function Dot({ color }: { color: string | null | undefined }) {
  return <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: swatchColor(color) ?? "var(--subtle-foreground)" }} aria-hidden />;
}

function StatusDot({ status }: { status: ReviewStatus }) {
  return <span className={cn("size-1.5 shrink-0 rounded-full", STATUS_DOT[status])} aria-hidden />;
}

/** Grid view: a compact tile. The whole tile opens the editor. */
export function ProblemTile({ card, status, onEdit }: ViewProps) {
  const { t, subject, topic, hasText } = useProblemContext(card);
  return (
    <button type="button" onClick={onEdit} className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-border bg-card text-left shadow-xs transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-px hover:shadow-md">
      <span className="flex items-center gap-2 px-3 pt-2.5 pb-2 text-caption text-muted-foreground">
        <Dot color={subject?.color} />
        <span className="min-w-0 flex-1 truncate">{topic?.name ?? subject?.name}</span>
        {card.isHighYield && <span className="shrink-0 rounded-full bg-mark-soft px-1.5 py-0.5 font-medium text-mark-foreground">{t.problem.priority}</span>}
      </span>
      <span className="relative block h-32 overflow-hidden border-y border-border bg-white">
        {hasText ? (
          <span className="block h-full bg-card p-3">
            <MathText text={card.questionLatex} className="line-clamp-6 text-[14px] leading-[1.45]" />
          </span>
        ) : (
          <StoredImage fill path={card.originalCropPath} alt={t.problem.imageAlt} className="object-cover object-top" />
        )}
      </span>
      <span className="flex items-center gap-2 px-3 py-2 text-caption text-muted-foreground">
        <StatusDot status={status} />
        <span className="flex-1 truncate">{t.problem.status[status]}</span>
        {card.attemptCount > 0 && <span className="tabular-nums">{format(t.problem.attempts, { n: card.attemptCount })}</span>}
      </span>
    </button>
  );
}

const ROW_COLUMNS = "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.1fr)_7.5rem_minmax(0,1fr)]";

/** List view header: shown once above a section's rows. */
export function ProblemRowHeader() {
  const { t } = useVault();
  return (
    <div aria-hidden className={cn("hidden gap-x-4 border-b border-border px-4 py-2 md:grid", ROW_COLUMNS)}>
      {[t.vault.columns.problem, t.vault.columns.where, t.vault.columns.status, t.vault.columns.tags].map((heading) => (
        <span key={heading} className="text-overline">
          {heading}
        </span>
      ))}
    </div>
  );
}

/** List view: one full-width, table-like row. The whole row opens the editor. */
export function ProblemRow({ card, status, onEdit }: ViewProps) {
  const { t, subject, source, topic, tags, hasText } = useProblemContext(card);
  const where = source ? `${source.title}${card.sourcePage ? ` · ${format(t.problem.pageShort, { n: card.sourcePage })}` : ""}` : (topic?.name ?? t.vault.noSource);
  return (
    <button type="button" onClick={onEdit} className={cn("grid w-full items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-muted", ROW_COLUMNS)}>
      <span className="flex min-w-0 items-center gap-3">
        {hasText ? (
          <MathText text={card.questionLatex} className="line-clamp-2 min-w-0 flex-1 text-[14px] leading-[1.45]" />
        ) : (
          <span className="relative h-10 w-16 shrink-0 overflow-hidden rounded border border-border bg-white">
            <StoredImage fill path={card.originalCropPath} alt={t.problem.imageAlt} className="object-cover object-top" />
          </span>
        )}
        {card.isHighYield && <Flag className="size-3.5 shrink-0 text-mark-foreground" aria-label={t.problem.priority} />}
      </span>
      <span className="hidden min-w-0 space-y-0.5 md:block">
        <span className="flex items-center gap-1.5 text-sm">
          <Dot color={subject?.color} />
          <span className="truncate">{subject?.name}</span>
        </span>
        <span className="block truncate pl-3 text-caption text-muted-foreground">{where}</span>
      </span>
      <span className="flex items-center gap-1.5 text-caption text-muted-foreground">
        <StatusDot status={status} />
        <span className="truncate">{t.problem.status[status]}</span>
        {card.attemptCount > 0 && <span className="tabular-nums">· {card.attemptCount}</span>}
      </span>
      <span className="hidden min-w-0 truncate text-caption text-muted-foreground md:block">{tags.length > 0 ? tags.map((tag) => tagDisplayName(t, tag)).join(", ") : "–"}</span>
    </button>
  );
}

/** Detailed view: the full card, with its solution and takeaway always shown together with the question. */
export function ProblemBox({ card, status, onEdit }: ViewProps) {
  const { t, subject, source, tags, hasText } = useProblemContext(card);

  return (
    <article className="group overflow-hidden rounded-lg border border-border bg-card shadow-xs transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-px hover:shadow-md">
      <header className="flex items-center gap-2 py-1.5 pr-1.5 pl-3.5 text-caption text-muted-foreground">
        <Dot color={subject?.color} />
        <span className="min-w-0 flex-1 truncate">
          {subject?.name}
          {source && ` · ${source.title}`}
          {card.sourcePage !== null && source && ` · ${format(t.problem.pageShort, { n: card.sourcePage })}`}
        </span>
        {card.isHighYield && <span className="shrink-0 rounded-full bg-mark-soft px-2 py-0.5 font-medium text-mark-foreground">{t.problem.priority}</span>}
        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={t.common.edit} title={t.common.edit}>
          <Pencil />
        </Button>
      </header>

      <div className="border-y border-border">
        {hasText ? (
          <MathText text={card.questionLatex} className="max-h-72 overflow-y-auto p-3.5 text-reading" />
        ) : (
          <div className="bg-white">
            <StoredImage path={card.originalCropPath} alt={t.problem.imageAlt} className="mx-auto block max-h-72 w-auto max-w-full" />
          </div>
        )}
        {hasText && card.diagramImagePath && (
          <div className="border-t border-border bg-white">
            <StoredImage path={card.diagramImagePath} alt={t.review.figure} className="mx-auto block max-h-56 w-auto max-w-full" />
          </div>
        )}
      </div>

      <div className="space-y-3 p-3.5">
        <div className="space-y-1">
          <h3 className="text-caption font-medium text-muted-foreground">{t.problem.solution}</h3>
          {card.correctAnswerLatex && <MathText text={card.correctAnswerLatex} className="text-reading" />}
          {card.solutionLatex ? <MathText text={card.solutionLatex} className="text-reading" /> : !card.correctAnswerLatex && <p className="text-sm text-subtle">{t.vault.noSolution}</p>}
        </div>
        {card.ahaNote && (
          <div className="space-y-1 border-l-2 border-mark pl-3">
            <h3 className="text-caption font-medium text-muted-foreground">{t.problem.takeaway}</h3>
            <MathText text={card.ahaNote} className="text-sm" />
          </div>
        )}
        <footer className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-caption text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <StatusDot status={status} />
            {t.problem.status[status]}
          </span>
          {card.attemptCount > 0 && <span className="tabular-nums">{format(t.problem.attempts, { n: card.attemptCount })}</span>}
          {tags.map((tag) => (
            <span key={tag.id} className="flex items-center gap-1.5">
              <Dot color={tag.color} />
              {tagDisplayName(t, tag)}
            </span>
          ))}
        </footer>
      </div>
    </article>
  );
}
