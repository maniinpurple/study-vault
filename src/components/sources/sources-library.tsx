"use client";

import { motion } from "framer-motion";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { useVault } from "@/components/app-provider";
import { Modal } from "@/components/modal";
import { HomeworkControls } from "@/components/sources/homework-controls";
import { SourcesTable } from "@/components/sources/sources-table";
import { UltraSplit } from "@/components/ultra-split";
import { useAppearance } from "@/components/use-appearance";
import { StoredImage } from "@/components/stored-image";
import { LoadMore, useVisibleCount } from "@/components/load-more";
import { UploadDialog, type UploadDraft } from "@/components/sources/upload-dialog";
import { SubjectDialog } from "@/components/subject-dialog";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { useStoredChoice } from "@/components/use-stored-choice";
import { ViewToggle } from "@/components/view-toggle";
import { STORAGE_KEYS, swatchColor } from "@/lib/constants";
import { DEFAULT_SOURCE_SORT, SOURCE_SORTS, sortSources, todayIn, type SourceSort } from "@/lib/homework";
import { format } from "@/lib/i18n";
import { spring, staggerDelay } from "@/lib/motion";
import { uploadThumbnailPath } from "@/lib/problems";
import type { ExamUpload } from "@/lib/repo/types";
import { openScanSelection, ScanSourceError } from "@/lib/scan-source";
import { cn } from "@/lib/utils";
import { VIEW_MODES, type ViewMode } from "@/lib/view-mode";
import { SOURCES_PAGE_SIZE } from "@/lib/vault";

const ACCEPT = "application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/webp,image/heic,image/heif,.pdf,.docx";

export function SourcesLibrary() {
  const { snapshot, t, locale, user, loadedAt, activeSubjectId, actions } = useVault();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [over, setOver] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [creatingSubject, setCreatingSubject] = React.useState(false);
  const [deleting, setDeleting] = React.useState<ExamUpload | null>(null);
  const [draft, setDraft] = React.useState<UploadDraft | null>(null);
  const draftRef = React.useRef<UploadDraft | null>(null);
  React.useEffect(() => {
    draftRef.current = draft;
  });
  // Leaving the page with a dialog open must still release the opened PDF.
  React.useEffect(() => () => draftRef.current?.source.destroy(), []);
  const [view, setView] = useStoredChoice<ViewMode>(STORAGE_KEYS.sourcesView, VIEW_MODES, "box");

  const subjects = snapshot.subjects.filter((s) => s.archivedAt === null);
  const scope = subjects.find((s) => s.id === activeSubjectId) ?? null;
  const [sort, setSort] = useStoredChoice<SourceSort>(STORAGE_KEYS.sourcesSort, SOURCE_SORTS, DEFAULT_SOURCE_SORT);
  const ultra = useAppearance().uiMode === "ultra-minimal";
  const subjectNameOf = (source: ExamUpload) => subjects.find((s) => s.id === source.subjectId)?.name ?? null;
  const sources = sortSources(snapshot.examUploads.filter((u) => !scope || u.subjectId === scope.id), sort, locale, subjectNameOf);
  /** The student's own calendar day, which "overdue" and "due today" are measured against. */
  const today = todayIn(loadedAt, user.timezone);
  const pageSize = SOURCES_PAGE_SIZE[view];
  const [shown, showMore] = useVisibleCount(`${scope?.id ?? ""}|${view}|${sort}`, pageSize);
  const visibleSources = sources.slice(0, shown);
  const snipCount = (id: string) => snapshot.cards.filter((c) => c.examUploadId === id && c.archivedAt === null).length;
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: user.timezone });

  /** Validate and open the selection, then ask the student to confirm its details in the upload dialog. */
  async function prepare(selection: File[]) {
    if (busy || selection.length === 0) return;
    if (subjects.length === 0) {
      setError(t.sources.needSubject);
      return setCreatingSubject(true);
    }
    setBusy(true);
    setError(null);
    try {
      setDraft(await openScanSelection(selection));
    } catch (err) {
      setError(err instanceof ScanSourceError ? t.sources.errors[err.code] : t.common.errorGeneric);
    } finally {
      setBusy(false);
    }
  }

  function closeDraft() {
    draftRef.current?.source.destroy();
    setDraft(null);
  }

  return (
    <UltraSplit kind="sources">
    <div
      className="space-y-8"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        void prepare(Array.from(e.dataTransfer.files));
      }}
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-display">{t.sources.title}</h1>
          <p className="vl-standard-only max-w-xl text-muted-foreground">{t.sources.subtitle}</p>
        </div>
        <Button size="lg" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? <Loader2 className="animate-spin" /> : <Upload />}
          {busy ? t.sources.reading : t.sources.upload}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-label={t.sources.browse}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void prepare(files);
          }}
        />
      </header>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {sources.length === 0 || over ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex w-full flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center transition-colors",
            over ? "border-brand bg-accent" : "border-border-strong hover:bg-muted",
          )}
        >
          <span className="text-title">{sources.length === 0 && !over ? t.sources.empty : t.sources.dropTitle}</span>
          <span className="max-w-sm text-muted-foreground">{sources.length === 0 && !over ? t.sources.emptyBody : t.sources.dropBody}</span>
          <span className="text-caption text-subtle">{t.sources.dropHint}</span>
        </button>
      ) : (
        <div className="space-y-4">
          {ultra ? (
            <SourcesTable sources={visibleSources} subjectName={subjectNameOf} snipCount={(source) => snipCount(source.id)} today={today} sort={sort} onSort={setSort} onDelete={setDeleting} />
          ) : (
            <>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <label className="flex items-center gap-2 text-caption text-muted-foreground">
              {t.homework.sortLabel}
              <Select aria-label={t.homework.sortLabel} value={sort} onChange={(e) => setSort(e.target.value as SourceSort)} className="h-8 w-auto text-sm">
                {SOURCE_SORTS.map((option) => (
                  <option key={option} value={option}>
                    {t.homework.sort[option]}
                  </option>
                ))}
              </Select>
            </label>
            <ViewToggle id="sources-view" label={t.common.view.label} value={view} modes={VIEW_MODES} labels={t.common.view} onChange={setView} />
          </div>
          <div className={cn(view === "list" && "overflow-hidden rounded-lg border border-border bg-card shadow-xs")}>
            {view === "list" && (
              <div aria-hidden className={cn("hidden gap-x-4 border-b border-border py-2 pr-14 pl-4 md:grid", LIST_COLUMNS)}>
                {[t.sources.columns.title, t.sources.columns.subject, t.sources.columns.pages, t.sources.columns.snips, t.sources.columns.added, t.homework.columnDeadline].map((heading) => (
                  <span key={heading} className="text-overline">
                    {heading}
                  </span>
                ))}
              </div>
            )}
            <ul className={cn(view === "box" && "grid gap-5 sm:grid-cols-2 xl:grid-cols-3", view === "grid" && "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6", view === "list" && "divide-y divide-border")}>
              {visibleSources.map((source, i) => {
                const subject = subjects.find((s) => s.id === source.subjectId);
                const count = snipCount(source.id);
                const item = { source, subjectName: subject?.name ?? null, subjectColor: subject?.color ?? null, snipLabel: count > 0 ? format(t.sources.snips, { n: count }) : t.sources.noSnips, hasSnips: count > 0, pagesLabel: format(t.sources.pages, { n: source.pageCount ?? 1 }), dateLabel: dateFmt.format(source.createdAt), today };
                return (
                  <motion.li key={source.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.smooth, delay: staggerDelay(i) }} className="group relative">
                    {view === "list" ? <SourceRow {...item} /> : <SourceCard {...item} compact={view === "grid"} />}
                    <Button
                      variant={view === "list" ? "ghost" : "outline"}
                      size="icon-sm"
                      aria-label={`${t.sources.delete}: ${source.title}`}
                      title={t.sources.delete}
                      onClick={() => setDeleting(source)}
                      className={cn("absolute z-20 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100", view === "list" ? "top-1/2 right-3 -translate-y-1/2" : "top-2 right-2 bg-card shadow-xs")}
                    >
                      <Trash2 />
                    </Button>
                  </motion.li>
                );
              })}
            </ul>
          </div>
            </>
          )}
          <LoadMore remaining={sources.length - visibleSources.length} step={pageSize} onMore={showMore} />
        </div>
      )}

      <UploadDialog draft={draft} defaultSubjectId={scope?.id ?? null} onClose={closeDraft} />
      <SubjectDialog open={creatingSubject} onClose={() => setCreatingSubject(false)} />
      <Modal open={deleting !== null} onClose={() => setDeleting(null)} title={t.sources.deleteTitle} description={t.sources.deleteBody}>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="lg" onClick={() => setDeleting(null)}>
            {t.common.cancel}
          </Button>
          <Button
            variant="destructive"
            size="lg"
            onClick={() => {
              const target = deleting;
              setDeleting(null);
              if (target) void actions.deleteSource(target.id);
            }}
          >
            {t.common.confirmDelete}
          </Button>
        </div>
      </Modal>
    </div>
    </UltraSplit>
  );
}

interface ItemProps {
  source: ExamUpload;
  subjectName: string | null;
  subjectColor: string | null;
  pagesLabel: string;
  snipLabel: string;
  hasSnips: boolean;
  dateLabel: string;
  today: string;
}

const LIST_COLUMNS = "grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.1fr)_5rem_7rem_6.5rem_minmax(0,2.6fr)]";

function Thumbnail({ source, className, iconClass }: { source: ExamUpload; className: string; iconClass: string }) {
  return (
    <StoredImage
      fill
      path={uploadThumbnailPath(source)}
      alt=""
      className={className}
      fallback={
        <span className="grid size-full place-items-center text-subtle">
          <FileText className={iconClass} aria-hidden />
        </span>
      }
    />
  );
}

function SubjectDot({ color }: { color: string | null }) {
  return <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: swatchColor(color) ?? "var(--subtle-foreground)" }} aria-hidden />;
}

/** Grid (compact) and Detailed (large preview) cards. The title area is a stretched link; the homework controls sit above it. */
function SourceCard({ source, subjectName, subjectColor, pagesLabel, snipLabel, hasSnips, dateLabel, today, compact }: ItemProps & { compact: boolean }) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg border border-border bg-card shadow-xs transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-px hover:shadow-md", source.completed && "opacity-80")}>
      <Link href={`/sources/${source.id}`} className="block after:absolute after:inset-0 after:content-['']">
        <div className={cn("relative overflow-hidden border-b border-border bg-sunken", compact ? "aspect-[3/4]" : "aspect-[4/3]")}>
          <Thumbnail source={source} className="size-full object-cover object-top" iconClass={compact ? "size-5" : "size-7"} />
        </div>
        <div className={cn("space-y-1", compact ? "p-2.5" : "p-3.5")}>
          <h2 className={cn("truncate", compact ? "text-sm font-medium" : "text-heading")}>{source.title}</h2>
          <p className="flex items-center gap-1.5 truncate text-caption text-muted-foreground">
            {subjectName && <SubjectDot color={subjectColor} />}
            {subjectName && <span className="truncate">{subjectName}</span>}
            {subjectName && !compact && <span aria-hidden>·</span>}
            {!compact && <span className="shrink-0 tabular-nums">{pagesLabel}</span>}
          </p>
          <p className="flex justify-between gap-2 text-caption text-subtle">
            <span className={cn("tabular-nums", hasSnips && "font-medium text-mark-foreground")}>{snipLabel}</span>
            {!compact && <span className="shrink-0">{dateLabel}</span>}
          </p>
        </div>
      </Link>
      <HomeworkControls source={source} today={today} className={cn("relative z-10 border-t border-border", compact ? "p-2" : "px-3.5 py-2.5")} />
    </div>
  );
}

/** List view: one full-width, table-like row. The title is a stretched link; the homework controls sit above it. */
function SourceRow({ source, subjectName, subjectColor, pagesLabel, snipLabel, hasSnips, dateLabel, today }: ItemProps) {
  return (
    <div className={cn("relative grid items-center gap-x-4 gap-y-1 py-2.5 pr-14 pl-4 transition-colors hover:bg-muted", LIST_COLUMNS, source.completed && "opacity-80")}>
      <span className="flex min-w-0 items-center gap-3">
        <span className="relative h-12 w-9 shrink-0 overflow-hidden rounded border border-border bg-sunken">
          <Thumbnail source={source} className="size-full object-cover object-top" iconClass="size-4" />
        </span>
        <span className="min-w-0">
          <Link href={`/sources/${source.id}`} className="block truncate text-heading after:absolute after:inset-0 after:content-['']">
            {source.title}
          </Link>
          <span className="block truncate text-caption text-muted-foreground md:hidden">{[subjectName, pagesLabel, snipLabel].filter(Boolean).join(" · ")}</span>
        </span>
      </span>
      <span className="hidden min-w-0 items-center gap-1.5 text-sm md:flex">
        {subjectName ? (
          <>
            <SubjectDot color={subjectColor} />
            <span className="truncate">{subjectName}</span>
          </>
        ) : (
          "–"
        )}
      </span>
      <span className="hidden text-sm text-muted-foreground tabular-nums md:block">{pagesLabel}</span>
      <span className={cn("hidden text-sm tabular-nums md:block", hasSnips ? "font-medium text-mark-foreground" : "text-subtle")}>{snipLabel}</span>
      <span className="hidden text-caption text-muted-foreground md:block">{dateLabel}</span>
      <HomeworkControls source={source} today={today} className="relative z-10 col-span-full md:col-span-1" />
    </div>
  );
}
