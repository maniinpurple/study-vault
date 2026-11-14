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
import { SCAN_LIMITS, swatchColor } from "@/lib/constants";
import { format } from "@/lib/i18n";
import { spring, staggerDelay } from "@/lib/motion";
import { uploadThumbnailPath } from "@/lib/problems";
import type { ExamUpload } from "@/lib/repo/types";
import { canvasToBlob, fingerprintFiles, openScanSelection, ScanSourceError } from "@/lib/scan-source";
import { cn } from "@/lib/utils";

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
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sources.map((source, i) => {
            const subject = subjects.find((s) => s.id === source.subjectId);
            const count = snipCount(source.id);
            return (
              <motion.li key={source.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.smooth, delay: staggerDelay(i) }} className="group relative">
                <Link href={`/sources/${source.id}`} className="block overflow-hidden rounded-lg border border-border bg-card shadow-xs transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-px hover:shadow-md">
                  <div className="aspect-[4/3] overflow-hidden border-b border-border bg-sunken">
                    <StoredImage
                      path={uploadThumbnailPath(source)}
                      alt=""
                      className="size-full object-cover object-top"
                      fallback={
                        <div className="grid size-full place-items-center text-subtle">
                          <FileText className="size-7" aria-hidden />
                        </div>
                      }
                    />
                  </div>
                  <div className="space-y-1 p-3.5">
                    <h2 className="truncate text-heading">{source.title}</h2>
                    <p className="flex items-center gap-1.5 truncate text-caption text-muted-foreground">
                      {subject && <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: swatchColor(subject.color) ?? "var(--subtle-foreground)" }} aria-hidden />}
                      {subject && <span className="truncate">{subject.name}</span>}
                      {subject && <span aria-hidden>·</span>}
                      <span className="shrink-0 tabular-nums">{format(t.sources.pages, { n: source.pageCount ?? 1 })}</span>
                    </p>
                    <p className="flex justify-between gap-2 text-caption text-subtle">
                      <span className={cn("tabular-nums", count > 0 && "font-medium text-mark-foreground")}>{count > 0 ? format(t.sources.snips, { n: count }) : t.sources.noSnips}</span>
                      <span className="shrink-0">{dateFmt.format(source.createdAt)}</span>
                    </p>
                  </div>
                </Link>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={`${t.sources.delete}: ${source.title}`}
                  title={t.sources.delete}
                  onClick={() => setDeleting(source)}
                  className="absolute top-2 right-2 bg-card opacity-0 shadow-xs transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 />
                </Button>
              </motion.li>
            );
          })}
        </ul>
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
