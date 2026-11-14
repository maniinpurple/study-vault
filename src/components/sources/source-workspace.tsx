"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Hand, Minus, PanelRight, Plus, Scissors } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { useVault } from "@/components/app-provider";
import { Modal } from "@/components/modal";
import { SnipCard } from "@/components/sources/snip-card";
import { SourcePage, type PageSnip } from "@/components/sources/source-page";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { format } from "@/lib/i18n";
import { spring } from "@/lib/motion";
import { orderSnips } from "@/lib/problems";
import type { ExamUpload } from "@/lib/repo/types";
import type { NormBox } from "@/lib/scan-geometry";
import { canvasToBlob, cropCanvas, openScanSource, ScanDocument } from "@/lib/scan-source";
import { cn } from "@/lib/utils";

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

interface Flight {
  id: string;
  url: string;
  from: DOMRect;
  to: DOMRect | null;
}

/** Opens the stored file(s) of a source as a renderable document. */
function useSourceDocument(upload: ExamUpload | null) {
  const { actions } = useVault();
  const [state, setState] = React.useState<{ id: string; doc: ScanDocument | null; failed: boolean } | null>(null);
  const uploadId = upload?.id ?? null;
  const uploadRef = React.useRef(upload);
  React.useEffect(() => {
    uploadRef.current = upload;
  });

  React.useEffect(() => {
    const source = uploadRef.current;
    if (!uploadId || !source) return;
    let cancelled = false;
    let opened: ScanDocument | null = null;
    (async () => {
      try {
        const paths = source.fileKind === "PDF" ? [source.storagePath] : source.pageStoragePaths.length > 0 ? source.pageStoragePaths : [source.storagePath];
        const blobs = await Promise.all(paths.map((path) => actions.getBlob(path)));
        if (blobs.some((blob) => !blob)) throw new Error("MISSING");
        const files = blobs.map((blob, i) => new File([blob!], paths[i].split("/").pop() ?? `page-${i + 1}`, { type: blob!.type || source.mimeType }));
        const doc = new ScanDocument(await openScanSource(files, source.fileKind), files, source.sha256);
        if (cancelled) return doc.destroy();
        opened = doc;
        setState({ id: uploadId, doc, failed: false });
      } catch {
        if (!cancelled) setState({ id: uploadId, doc: null, failed: true });
      }
    })();
    return () => {
      cancelled = true;
      opened?.destroy();
    };
  }, [actions, uploadId]);

  const current = state && state.id === uploadId ? state : null;
  return { doc: current?.doc ?? null, failed: current?.failed ?? false };
}

export function SourceWorkspace({ sourceId }: { sourceId: string }) {
  const { snapshot, t, activeSubjectId, actions } = useVault();
  const upload = snapshot.examUploads.find((u) => u.id === sourceId) ?? null;
  const { doc, failed } = useSourceDocument(upload);

  const [snipMode, setSnipMode] = React.useState(true);
  const [zoom, setZoom] = React.useState(1);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [trayOpen, setTrayOpen] = React.useState(false);
  const [flight, setFlight] = React.useState<Flight | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState(upload?.title ?? "");
  const viewerRef = React.useRef<HTMLDivElement>(null);
  const trayRef = React.useRef<HTMLDivElement>(null);

  const subjects = snapshot.subjects.filter((s) => s.archivedAt === null);
  const subjectId = subjects.find((s) => s.id === upload?.subjectId)?.id ?? subjects.find((s) => s.id === activeSubjectId)?.id ?? subjects[0]?.id ?? null;
  const snips = React.useMemo(() => orderSnips(snapshot.cards, sourceId), [snapshot.cards, sourceId]);
  const numbers = new Map(snips.map((card, i) => [card.id, i + 1]));

  // Once the new card is in the tray, measure where its image sits so the crop can fly there.
  React.useLayoutEffect(() => {
    if (!flight || flight.to) return;
    const card = trayRef.current?.querySelector<HTMLElement>(`[data-snip-card="${flight.id}"]`);
    if (!card) return;
    card.scrollIntoView({ block: "nearest" });
    const target = card.querySelector<HTMLElement>(`[data-snip-image="${flight.id}"]`) ?? card;
    const rect = target.getBoundingClientRect();
    // Hidden tray (small screens) or an image that has not laid out yet: skip the flight.
    if (rect.width < 8 || rect.height < 8) {
      URL.revokeObjectURL(flight.url);
      return setFlight(null);
    }
    setFlight({ ...flight, to: rect });
  }, [flight, snips]);

  if (!upload) {
    return (
      <div className="grid h-[calc(100dvh-3rem)] place-items-center px-6 lg:h-dvh">
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">{t.sources.notFound}</p>
          <Link href="/sources" className="text-sm font-medium text-brand hover:underline">
            {t.sources.back}
          </Link>
        </div>
      </div>
    );
  }

  async function snip(page: number, box: NormBox, rect: DOMRect) {
    if (!doc || !upload) return;
    if (!subjectId) return setError(t.sources.needSubject);
    setError(null);
    try {
      const blob = await canvasToBlob(cropCanvas(await doc.pageCanvas(page, "original"), box), "image/jpeg", 0.92);
      const card = await actions.createProblem({ subjectId, examUploadId: upload.id, questionLatex: "", sourcePage: page, cropBox: { page, ...box }, originalCrop: blob });
      setSelectedId(card.id);
      setFlight({ id: card.id, url: URL.createObjectURL(blob), from: rect, to: null });
    } catch {
      setError(t.sources.tray.saveFailed);
    }
  }

  function selectFromPage(id: string) {
    setSelectedId(id);
    setTrayOpen(true);
    trayRef.current?.querySelector(`[data-snip-card="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function selectFromTray(id: string, page: number | null) {
    setSelectedId(id);
    if (page === null) return;
    setTrayOpen(false);
    viewerRef.current?.querySelector(`[data-page="${page}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  const stepZoom = (dir: 1 | -1) => {
    const index = ZOOM_STEPS.findIndex((z) => z >= zoom - 0.001);
    setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, (index === -1 ? ZOOM_STEPS.length - 1 : index) + dir))]);
  };

  const pageLabels = (page: number) => ({
    page: format(t.problem.page, { n: page }),
    snip: (n: number) => format(t.problem.label, { n }),
    rendering: t.sources.tools.rendering,
    failed: t.sources.tools.renderFailed,
  });
  const snipsOf = (page: number): PageSnip[] => snips.filter((c) => c.sourcePage === page && c.cropBox).map((c) => ({ id: c.id, number: numbers.get(c.id) ?? 0, box: c.cropBox! }));
  const tool = (active: boolean) => cn("relative flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors", active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground");

  return (
    <div className="flex h-[calc(100dvh-3rem)] flex-col lg:h-dvh">
      {/* Toolbar */}
      <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-3 py-2">
        <Link href="/sources" aria-label={t.sources.back} title={t.sources.back} className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
          <ChevronLeft className="size-4" aria-hidden />
        </Link>
        <input
          value={title}
          aria-label={t.sources.titleLabel}
          maxLength={120}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title.trim() !== upload.title && void actions.updateSource(upload.id, { title })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className="h-7 min-w-0 flex-1 truncate rounded-md bg-transparent px-1.5 font-serif text-[17px] font-medium hover:bg-muted focus-visible:bg-muted sm:max-w-sm"
        />
        {subjects.length > 0 && (
          <Select aria-label={t.problem.subject} value={subjectId ?? ""} onChange={(e) => void actions.updateSource(upload.id, { subjectId: e.target.value })} className="h-7 w-auto max-w-40 text-[13px]">
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div role="group" aria-label={t.sources.tools.viewer} className="flex rounded-lg bg-muted p-0.5">
            {([true, false] as const).map((mode) => (
              <button key={String(mode)} type="button" aria-pressed={snipMode === mode} onClick={() => setSnipMode(mode)} title={mode ? t.sources.tools.snipHint : t.sources.tools.panHint} className={tool(snipMode === mode)}>
                {snipMode === mode && <motion.span layoutId="source-tool" transition={spring.snappy} className="absolute inset-0 rounded-md bg-card shadow-xs" aria-hidden />}
                {mode ? <Scissors className="relative size-3.5" aria-hidden /> : <Hand className="relative size-3.5" aria-hidden />}
                <span className="relative">{mode ? t.sources.tools.snip : t.sources.tools.pan}</span>
              </button>
            ))}
          </div>
          <div className="hidden items-center sm:flex">
            <Button variant="ghost" size="icon-sm" onClick={() => stepZoom(-1)} disabled={zoom <= ZOOM_STEPS[0]} aria-label={t.sources.tools.zoomOut}>
              <Minus />
            </Button>
            <button type="button" onClick={() => setZoom(1)} title={t.sources.tools.fit} className="h-7 min-w-12 rounded-md text-center text-caption text-muted-foreground tabular-nums hover:bg-muted hover:text-foreground">
              {Math.round(zoom * 100)}%
            </button>
            <Button variant="ghost" size="icon-sm" onClick={() => stepZoom(1)} disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} aria-label={t.sources.tools.zoomIn}>
              <Plus />
            </Button>
          </div>
          <Button variant="outline" size="sm" className="lg:hidden" aria-pressed={trayOpen} onClick={() => setTrayOpen((v) => !v)} aria-label={trayOpen ? t.sources.tray.hide : t.sources.tray.show}>
            <PanelRight />
            <span className="tabular-nums">{snips.length}</span>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Document */}
        <div ref={viewerRef} className={cn("min-w-0 flex-1 overflow-auto bg-sunken", trayOpen && "hidden lg:block")}>
          <p className="sticky top-0 z-10 border-b border-border bg-sunken/90 px-4 py-1.5 text-caption text-muted-foreground backdrop-blur-sm" role={error ? "alert" : undefined}>
            {error ? <span className="text-destructive">{error}</span> : snipMode ? t.sources.tools.snipHint : t.sources.tools.panHint}
          </p>
          {failed ? (
            <p role="alert" className="p-10 text-center text-sm text-destructive">
              {t.sources.fileMissing}
            </p>
          ) : !doc ? (
            <p role="status" className="p-10 text-center text-sm text-muted-foreground">
              {t.common.loading}
            </p>
          ) : (
            <div className="mx-auto space-y-5 px-4 py-5 sm:px-6" style={{ width: `${zoom * 100}%`, maxWidth: zoom <= 1 ? `${zoom * 60}rem` : undefined }}>
              {Array.from({ length: doc.pageCount }, (_, i) => i + 1).map((page) => (
                <div key={page} className="space-y-1.5">
                  <p className="text-caption text-subtle tabular-nums">{format(t.problem.page, { n: page })}</p>
                  <SourcePage doc={doc} page={page} scrollRoot={viewerRef} snips={snipsOf(page)} selectedId={selectedId} snipMode={snipMode} labels={pageLabels(page)} onSnip={(p, box, rect) => void snip(p, box, rect)} onSelect={selectFromPage} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Snippets tray */}
        <aside ref={trayRef} aria-label={t.sources.tray.title} className={cn("w-full shrink-0 overflow-y-auto border-border bg-background lg:block lg:w-[400px] lg:border-l", trayOpen ? "block" : "hidden")}>
          <div className="sticky top-0 z-10 flex items-baseline justify-between border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur-sm">
            <h2 className="text-heading">{t.sources.tray.title}</h2>
            <span className="text-caption text-subtle tabular-nums">{snips.length > 0 ? format(t.sources.snips, { n: snips.length }) : ""}</span>
          </div>
          {snips.length === 0 ? (
            <div className="space-y-1.5 px-6 py-14 text-center">
              <p className="text-sm font-medium">{t.sources.tray.empty}</p>
              <p className="text-sm text-muted-foreground">{t.sources.tray.emptyBody}</p>
            </div>
          ) : (
            <ul className="space-y-3 p-3">
              <AnimatePresence initial={false} mode="popLayout">
                {snips.map((card) => (
                  <motion.li key={card.id} layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={spring.smooth}>
                    <SnipCard
                      card={card}
                      number={numbers.get(card.id) ?? 0}
                      selected={card.id === selectedId}
                      landing={flight?.id === card.id}
                      onSelect={() => selectFromTray(card.id, card.sourcePage)}
                      onDelete={() => setDeletingId(card.id)}
                    />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </aside>
      </div>

      {/* The crop lifts off the page and lands in its card. */}
      {flight?.to && (
        <motion.img
          src={flight.url}
          alt=""
          aria-hidden
          initial={{ left: flight.from.left, top: flight.from.top, width: flight.from.width, height: flight.from.height, opacity: 0.96 }}
          animate={{ left: flight.to.left, top: flight.to.top, width: flight.to.width, height: flight.to.height, opacity: 1 }}
          transition={spring.lively}
          onAnimationComplete={() => {
            URL.revokeObjectURL(flight.url);
            setFlight(null);
          }}
          className="pointer-events-none fixed z-50 rounded-sm object-fill shadow-lg"
        />
      )}

      <Modal open={deletingId !== null} onClose={() => setDeletingId(null)} title={t.problem.deleteTitle} description={t.problem.deleteBody}>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="lg" onClick={() => setDeletingId(null)}>
            {t.common.cancel}
          </Button>
          <Button
            variant="destructive"
            size="lg"
            onClick={() => {
              const id = deletingId;
              setDeletingId(null);
              if (id) void actions.deleteProblem(id);
            }}
          >
            {t.common.confirmDelete}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
