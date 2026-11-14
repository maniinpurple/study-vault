"use client";

import { motion } from "framer-motion";
import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { useVault } from "@/components/app-provider";
import { Modal } from "@/components/modal";
import { StoredImage } from "@/components/stored-image";
import { SubjectDialog } from "@/components/subject-dialog";
import { Button } from "@/components/ui/button";
import { useStoredChoice } from "@/components/use-stored-choice";
import { ViewToggle } from "@/components/view-toggle";
import { SCAN_LIMITS, STORAGE_KEYS, swatchColor } from "@/lib/constants";
import { format } from "@/lib/i18n";
import { spring, staggerDelay } from "@/lib/motion";
import { uploadThumbnailPath } from "@/lib/problems";
import type { ExamUpload } from "@/lib/repo/types";
import { canvasToBlob, fingerprintFiles, openScanSelection, ScanSourceError } from "@/lib/scan-source";
import { cn } from "@/lib/utils";
import { VIEW_MODES, type ViewMode } from "@/lib/view-mode";

const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif,.pdf";
const stripExtension = (name: string) => name.replace(/\.(pdf|png|jpe?g|webp|heic|heif)$/i, "");

export function SourcesLibrary() {
  const { snapshot, t, locale, user, activeSubjectId, actions } = useVault();
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [over, setOver] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [creatingSubject, setCreatingSubject] = React.useState(false);
  const [deleting, setDeleting] = React.useState<ExamUpload | null>(null);
  const [view, setView] = useStoredChoice<ViewMode>(STORAGE_KEYS.sourcesView, VIEW_MODES, "box");

  const subjects = snapshot.subjects.filter((s) => s.archivedAt === null);
  const scope = subjects.find((s) => s.id === activeSubjectId) ?? null;
  const sources = snapshot.examUploads.filter((u) => !scope || u.subjectId === scope.id);
  const snipCount = (id: string) => snapshot.cards.filter((c) => c.examUploadId === id && c.archivedAt === null).length;
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: user.timezone });

  async function upload(selection: File[]) {
    if (busy || selection.length === 0) return;
    const subjectId = scope?.id ?? subjects[0]?.id;
    if (!subjectId) {
      setError(t.sources.needSubject);
      return setCreatingSubject(true);
    }
    setBusy(true);
    setError(null);
    try {
      const { source, files } = await openScanSelection(selection);
      try {
        const thumbnail = await canvasToBlob(await source.renderPage(1, SCAN_LIMITS.thumbnailLongEdge), "image/jpeg", 0.8).catch(() => null);
        const created = await actions.createSource({
          title: stripExtension(files[0].name),
          subjectId,
          fileKind: source.kind,
          mimeType: files[0].type || (source.kind === "PDF" ? "application/pdf" : "image/jpeg"),
          fileSizeBytes: files.reduce((sum, f) => sum + f.size, 0),
          pageCount: source.pageCount,
          sha256: await fingerprintFiles(files),
          files,
          thumbnail,
        });
        router.push(`/sources/${created.id}`);
      } finally {
        source.destroy();
      }
    } catch (err) {
      setError(err instanceof ScanSourceError ? t.sources.errors[err.code] : t.common.errorGeneric);
      setBusy(false);
    }
  }

  return (
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
        void upload(Array.from(e.dataTransfer.files));
      }}
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-display">{t.sources.title}</h1>
          <p className="max-w-xl text-muted-foreground">{t.sources.subtitle}</p>
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
            void upload(files);
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
          <div className="flex justify-end">
            <ViewToggle id="sources-view" label={t.common.view.label} value={view} modes={VIEW_MODES} labels={t.common.view} onChange={setView} />
          </div>
          <div className={cn(view === "list" && "overflow-hidden rounded-lg border border-border bg-card shadow-xs")}>
            {view === "list" && (
              <div aria-hidden className={cn("hidden gap-x-4 border-b border-border py-2 pr-14 pl-4 md:grid", LIST_COLUMNS)}>
                {[t.sources.columns.title, t.sources.columns.subject, t.sources.columns.pages, t.sources.columns.snips, t.sources.columns.added].map((heading) => (
                  <span key={heading} className="text-overline">
                    {heading}
                  </span>
                ))}
              </div>
            )}
            <ul className={cn(view === "box" && "grid gap-5 sm:grid-cols-2 xl:grid-cols-3", view === "grid" && "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6", view === "list" && "divide-y divide-border")}>
              {sources.map((source, i) => {
                const subject = subjects.find((s) => s.id === source.subjectId);
                const count = snipCount(source.id);
                const item = { source, subjectName: subject?.name ?? null, subjectColor: subject?.color ?? null, snipLabel: count > 0 ? format(t.sources.snips, { n: count }) : t.sources.noSnips, hasSnips: count > 0, pagesLabel: format(t.sources.pages, { n: source.pageCount ?? 1 }), dateLabel: dateFmt.format(source.createdAt) };
                return (
                  <motion.li key={source.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.smooth, delay: staggerDelay(i) }} className="group relative">
                    {view === "list" ? <SourceRow {...item} /> : <SourceCard {...item} compact={view === "grid"} />}
                    <Button
                      variant={view === "list" ? "ghost" : "outline"}
                      size="icon-sm"
                      aria-label={`${t.sources.delete}: ${source.title}`}
                      title={t.sources.delete}
                      onClick={() => setDeleting(source)}
                      className={cn("absolute opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100", view === "list" ? "top-1/2 right-3 -translate-y-1/2" : "top-2 right-2 bg-card shadow-xs")}
                    >
                      <Trash2 />
                    </Button>
                  </motion.li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

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
}

const LIST_COLUMNS = "grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_6rem_8rem_7rem]";

function Thumbnail({ source, className, iconClass }: { source: ExamUpload; className: string; iconClass: string }) {
  return (
    <StoredImage
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

/** Grid (compact) and Detailed (large preview) cards. */
function SourceCard({ source, subjectName, subjectColor, pagesLabel, snipLabel, hasSnips, dateLabel, compact }: ItemProps & { compact: boolean }) {
  return (
    <Link href={`/sources/${source.id}`} className="block overflow-hidden rounded-lg border border-border bg-card shadow-xs transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-px hover:shadow-md">
      <div className={cn("overflow-hidden border-b border-border bg-sunken", compact ? "aspect-[3/4]" : "aspect-[4/3]")}>
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
  );
}

/** List view: one full-width, table-like row. */
function SourceRow({ source, subjectName, subjectColor, pagesLabel, snipLabel, hasSnips, dateLabel }: ItemProps) {
  return (
    <Link href={`/sources/${source.id}`} className={cn("grid items-center gap-x-4 gap-y-1 py-2.5 pr-14 pl-4 transition-colors hover:bg-muted", LIST_COLUMNS)}>
      <span className="flex min-w-0 items-center gap-3">
        <span className="h-12 w-9 shrink-0 overflow-hidden rounded border border-border bg-sunken">
          <Thumbnail source={source} className="size-full object-cover object-top" iconClass="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-heading">{source.title}</span>
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
    </Link>
  );
}
