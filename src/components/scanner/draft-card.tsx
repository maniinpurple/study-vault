"use client";

import { Check, ChevronDown, Eye, EyeOff, Loader2, Pencil, RefreshCw, Save, Trash2, TriangleAlert } from "lucide-react";
import * as React from "react";

import { useApp } from "@/components/app-provider";
import { CrosshairCard } from "@/components/crosshair-card";
import { MathText } from "@/components/math-text";
import type { Draft } from "@/components/scanner/types";
import { useObjectUrl } from "@/components/scanner/use-object-url";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { format } from "@/lib/i18n";
import type { AdaptiveTag, Subject, Topic } from "@/lib/repo/types";
import { groupTopics } from "@/lib/scan-session";
import { tagDisplayName, tagsForSubject } from "@/lib/tags";
import { cn } from "@/lib/utils";

interface Props {
  draft: Draft;
  subjects: Subject[];
  topics: Topic[];
  tags: AdaptiveTag[];
  canRerun: boolean;
  onChange(id: string, patch: Partial<Draft>): void;
  onSave(id: string): void;
  onDelete(id: string): void;
  onRerun(id: string): void;
}

/** Plain toggle chip; `aria-pressed` carries the state for assistive tech. */
function Chip({ pressed, color, children, onClick }: { pressed: boolean; color?: string | null; children: React.ReactNode; onClick(): void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        pressed ? "border-primary/70 bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="size-2 rounded-full" style={{ backgroundColor: color ?? "var(--muted-foreground)" }} aria-hidden />
      {children}
      {pressed && <Check className="size-3.5" aria-hidden />}
    </button>
  );
}

export function DraftCard({ draft, subjects, topics, tags, canRerun, onChange, onSave, onDelete, onRerun }: Props) {
  const { t } = useApp();
  const id = React.useId();
  const [editing, setEditing] = React.useState(false);
  const [showOriginal, setShowOriginal] = React.useState(false);
  const diagramUrl = useObjectUrl(draft.diagramBlob);
  const originalUrl = useObjectUrl(showOriginal ? draft.originalBlob : null);

  const patch = (p: Partial<Draft>) => onChange(draft.id, p);
  const busy = draft.status === "queued" || draft.status === "processing";
  const groups = groupTopics(topics, draft.subjectId);
  const visibleTags = tagsForSubject(tags, draft.subjectId);
  const tagLabel = (tag: AdaptiveTag) => tagDisplayName(t, tag);
  const errorText = (code: string | null) => (code ? ((t.vault.errors as Record<string, string>)[code] ?? (t.scanner.errors as Record<string, string>)[code] ?? t.common.errorGeneric) : null);

  const statusBadge = {
    queued: <Badge variant="secondary">{t.scanner.drafts.status.queued}</Badge>,
    processing: (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="animate-spin" />
        {t.scanner.drafts.status.processing}
      </Badge>
    ),
    done: <Badge variant="outline">{t.scanner.drafts.status.done}</Badge>,
    failed: <Badge variant="destructive">{t.scanner.drafts.status.failed}</Badge>,
  }[draft.status];

  return (
    <CrosshairCard className={cn("space-y-4 p-4 sm:p-5", draft.saved && "opacity-75")}>
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="metric text-sm font-semibold">Q{draft.number}</h3>
        <span className="metric text-xs text-muted-foreground">{format(t.scanner.drafts.page, { n: draft.page })}</span>
        {draft.saved ? (
          <Badge className="gap-1"><Check />{t.scanner.drafts.saved}</Badge>
        ) : (
          statusBadge
        )}
        {draft.ocrConfidence !== null && draft.status === "done" && (
          <span className="metric text-xs text-muted-foreground">{format(t.scanner.drafts.confidence, { n: Math.round(draft.ocrConfidence * 100) })}</span>
        )}
        {!draft.saved && (
          <div className="ml-auto flex gap-1">
            {canRerun && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => onRerun(draft.id)}>
                <RefreshCw />
                {t.scanner.drafts.reextract}
              </Button>
            )}
            <Button variant="ghost" size="icon-sm" onClick={() => onDelete(draft.id)} aria-label={`${t.scanner.drafts.deleteDraft}: Q${draft.number}`}>
              <Trash2 />
            </Button>
          </div>
        )}
      </header>

      {draft.status === "failed" && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {errorText(draft.errorCode)}
        </p>
      )}

      <fieldset disabled={draft.saved || draft.saving} className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        {/* ── Content ───────────────────────────────────────────── */}
        <div className="min-w-0 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor={`${id}-text`} className="text-xs font-medium">{t.scanner.drafts.text}</label>
            <Button type="button" variant="ghost" size="xs" onClick={() => setEditing((v) => !v)} aria-pressed={editing}>
              {editing ? <Eye /> : <Pencil />}
              {editing ? t.scanner.drafts.previewText : t.scanner.drafts.editText}
            </Button>
          </div>

          {editing ? (
            <Textarea id={`${id}-text`} value={draft.questionLatex} onChange={(e) => patch({ questionLatex: e.target.value })} rows={8} spellCheck={false} className="metric text-[13px] leading-relaxed" aria-invalid={draft.saveErrorCode === "EMPTY_QUESTION" ? true : undefined} />
          ) : (
            <div id={`${id}-text`} className="min-h-24 rounded-lg border border-border bg-background/40 p-3">
              {busy ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><Loader2 className="size-4 animate-spin" aria-hidden />{t.scanner.drafts.status.processing}</p>
              ) : draft.questionLatex.trim() ? (
                <MathText text={draft.questionLatex} />
              ) : (
                <p className="text-sm text-muted-foreground">{t.scanner.drafts.emptyPreview}</p>
              )}
            </div>
          )}

          {diagramUrl && (
            <figure className="space-y-1.5">
              <figcaption className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2 rounded-full bg-chart-3" aria-hidden />
                {t.scanner.drafts.figure}
              </figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob: URL, not optimisable by next/image */}
              <img src={diagramUrl} alt={t.scanner.drafts.figure} className="max-h-72 w-auto max-w-full rounded-lg border border-border bg-white object-contain" />
            </figure>
          )}

          <div>
            <button
              type="button"
              aria-expanded={showOriginal}
              aria-controls={`${id}-original`}
              onClick={() => setShowOriginal((v) => !v)}
              className="flex items-center gap-1.5 rounded text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              {showOriginal ? <EyeOff className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
              {showOriginal ? t.scanner.drafts.hideOriginal : t.scanner.drafts.viewOriginal}
              <ChevronDown className={cn("size-3.5 transition-transform", showOriginal && "rotate-180")} aria-hidden />
            </button>
            <div id={`${id}-original`} hidden={!showOriginal} className="mt-2">
              {originalUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- local blob: URL
                <img src={originalUrl} alt={t.scanner.drafts.viewOriginal} className="max-h-96 w-auto max-w-full rounded-lg border border-border bg-white object-contain" />
              )}
            </div>
          </div>
        </div>

        {/* ── Metadata (everything optional except subject) ─────── */}
        <div className="min-w-0 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.scanner.drafts.subject} htmlFor={`${id}-subject`} error={draft.saveErrorCode === "NO_SUBJECT" ? errorText("noSubject") : null}>
              <Select id={`${id}-subject`} value={draft.subjectId ?? ""} onChange={(e) => {
                  const subjectId = e.target.value || null;
                  // Base tags are per subject: keep only global tags when the card moves to another subject.
                  const keep = new Set(tags.filter((tag) => tag.subjectId === null).map((tag) => tag.id));
                  patch({ subjectId, topicId: null, tagIds: draft.tagIds.filter((id) => keep.has(id)), saveErrorCode: null });
                }} aria-invalid={draft.saveErrorCode === "NO_SUBJECT" ? true : undefined}>
                {draft.subjectId === null && <option value="">{t.scanner.meta.subjectNone}</option>}
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label={t.scanner.drafts.topic} htmlFor={`${id}-topic`}>
              <Select id={`${id}-topic`} value={draft.topicId ?? ""} onChange={(e) => patch({ topicId: e.target.value || null })} disabled={!draft.subjectId}>
                <option value="">{t.scanner.drafts.noTopic}</option>
                {groups.map(({ chapter, children }) =>
                  children.length === 0 ? (
                    <option key={chapter.id} value={chapter.id}>{chapter.name}</option>
                  ) : (
                    <optgroup key={chapter.id} label={chapter.name}>
                      {children.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
                    </optgroup>
                  ),
                )}
              </Select>
            </Field>
          </div>

          <div className="space-y-1.5" role="group" aria-labelledby={`${id}-tags`}>
            <p id={`${id}-tags`} className="text-xs font-medium">{t.scanner.drafts.errorTags} <span className="font-normal text-muted-foreground">· {t.common.optional}</span></p>
            <div className="flex flex-wrap gap-1.5">
              {visibleTags.map((tag) => {
                const pressed = draft.tagIds.includes(tag.id);
                return (
                  <Chip key={tag.id} pressed={pressed} color={tag.color} onClick={() => patch({ tagIds: pressed ? draft.tagIds.filter((x) => x !== tag.id) : [...draft.tagIds, tag.id] })}>
                    {tagLabel(tag)}
                  </Chip>
                );
              })}
            </div>
          </div>

          <Field label={`${t.scanner.drafts.ahaNote} · ${t.common.optional}`} htmlFor={`${id}-aha`}>
            <Textarea id={`${id}-aha`} value={draft.ahaNote} onChange={(e) => patch({ ahaNote: e.target.value })} placeholder={t.scanner.drafts.ahaPlaceholder} rows={3} maxLength={2000} />
          </Field>

          <Field label={`${t.scanner.drafts.solution} · ${t.common.optional}`} htmlFor={`${id}-solution`} hint={t.scanner.drafts.solutionHint}>
            <Textarea id={`${id}-solution`} value={draft.solution} onChange={(e) => patch({ solution: e.target.value })} placeholder={t.scanner.drafts.solutionPlaceholder} rows={3} maxLength={8000} spellCheck={false} className="metric text-[13px]" />
          </Field>
          {draft.solution.trim() && (
            <div className="space-y-1 rounded-lg border border-border bg-background/40 p-3">
              <p className="text-xs font-medium text-muted-foreground">{t.scanner.drafts.solutionPreview}</p>
              <MathText text={draft.solution} />
            </div>
          )}

          <Field label={`${t.scanner.drafts.teacherNote} · ${t.common.optional}`} htmlFor={`${id}-teacher`}>
            <Textarea id={`${id}-teacher`} value={draft.teacherNote} onChange={(e) => patch({ teacherNote: e.target.value })} placeholder={t.scanner.drafts.teacherPlaceholder} rows={2} maxLength={2000} />
          </Field>

          <button
            type="button"
            role="switch"
            aria-checked={draft.isHighYield}
            onClick={() => patch({ isHighYield: !draft.isHighYield })}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              draft.isHighYield ? "border-chart-4/60 bg-chart-4/10" : "border-border hover:bg-muted/50",
            )}
          >
            <span>{t.scanner.drafts.highYield}</span>
            <span aria-hidden className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", draft.isHighYield ? "bg-chart-4" : "bg-muted")}>
              <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]", draft.isHighYield ? "left-[1.1rem]" : "left-0.5")} />
            </span>
          </button>
        </div>
      </fieldset>

      {!draft.saved && (
        <footer className="flex flex-wrap items-center justify-end gap-3">
          {draft.saveErrorCode && draft.saveErrorCode !== "NO_SUBJECT" && <p role="alert" className="mr-auto text-sm text-destructive">{errorText(draft.saveErrorCode === "EMPTY_QUESTION" ? "emptyQuestion" : draft.saveErrorCode)}</p>}
          <Button onClick={() => onSave(draft.id)} disabled={busy || draft.saving}>
            {draft.saving ? <><Loader2 className="animate-spin" />{t.scanner.drafts.saving}</> : <><Save />{t.scanner.drafts.saveOne}</>}
          </Button>
        </footer>
      )}
    </CrosshairCard>
  );
}
