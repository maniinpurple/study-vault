"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Hand, Minus, PanelRight, Plus, RotateCw, Scissors } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";

import { useVault } from "@/components/app-provider";
import { Modal } from "@/components/modal";
import { HelpTip } from "@/components/sources/help-tip";
import { SnipCard } from "@/components/sources/snip-card";
import { DarkroomBar } from "@/components/sources/darkroom-bar";
import { useAppearance } from "@/components/use-appearance";
import { usePanKey } from "@/components/use-pan-key";
import { useStoredChoice } from "@/components/use-stored-choice";
import { SourcePage, type PageSnip, type PendingRegion, type RegionToolbar } from "@/components/sources/source-page";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { STORAGE_KEYS } from "@/lib/constants";
import { format } from "@/lib/i18n";
import { DEFAULT_PAN_KEY_MODE, PAN_KEY_MODES } from "@/lib/pan-key";
import { normalizeTurns, parseRotations, rotatedPage, rotateBox, rotateCanvas, rotationStorageKey, serializeRotations, unrotateBox, type PageRotations } from "@/lib/page-rotation";
import { spring } from "@/lib/motion";
import { pickAiKey } from "@/lib/ai-keys";
import { cropRegions, orderSnips } from "@/lib/problems";
import type { CropRegion, ExamUpload } from "@/lib/repo/types";
import type { NormBox } from "@/lib/scan-geometry";
import { canvasToBlob, cropCanvas, openScanSource, ScanDocument, stitchCanvases } from "@/lib/scan-source";
import { MAX_STITCH_PARTS, sortRegions } from "@/lib/stitch";
import { cn } from "@/lib/utils";

interface Flight {
  id: string;
  url: string;
  from: DOMRect;
  to: DOMRect | null;
}

const NO_SNIPS: PageSnip[] = [];
const NO_PENDING: PendingRegion[] = [];
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

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
  const [pending, setPending] = React.useState<(CropRegion & { key: string })[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [trayOpen, setTrayOpen] = React.useState(false);
  const [flight, setFlight] = React.useState<Flight | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState(upload?.title ?? "");
  const [rotations, setRotations] = React.useState<PageRotations>(() => {
    try {
      return parseRotations(localStorage.getItem(rotationStorageKey(sourceId)));
    } catch {
      return {};
    }
  });
  // Pan key: Shift or Space (hold or toggle, per Settings). While it is on, dragging pans instead of drawing a crop box.
  const [panKeyMode] = useStoredChoice(STORAGE_KEYS.panKey, PAN_KEY_MODES, DEFAULT_PAN_KEY_MODE);
  const panKeyOn = usePanKey(panKeyMode, true);
  const cropping = snipMode && !panKeyOn;
  // Ultra-minimal: the "Darkroom" layout (slim dark bar, charcoal canvas, floating notes card).
  const ultra = useAppearance().uiMode === "ultra-minimal";
  const [notesOpen, setNotesOpen] = React.useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  const pageNowRef = React.useRef<HTMLSpanElement>(null);
  const lastPageCheck = React.useRef(0);
  const viewerRef = React.useRef<HTMLDivElement>(null);
  const trayRef = React.useRef<HTMLDivElement>(null);
  const zoomLabelRef = React.useRef<HTMLSpanElement>(null);
  const zoomRef = React.useRef<ReactZoomPanPinchRef>(null);

  const subjects = snapshot.subjects.filter((s) => s.archivedAt === null);
  const subjectId = subjects.find((s) => s.id === upload?.subjectId)?.id ?? subjects.find((s) => s.id === activeSubjectId)?.id ?? subjects[0]?.id ?? null;
  const snips = React.useMemo(() => orderSnips(snapshot.cards, sourceId), [snapshot.cards, sourceId]);
  const stitching = pending.length > 1;
  const newest = pending[pending.length - 1] ?? null;
  /** Pending regions in the order they will be stacked, numbered from 1. */
  const ordered = React.useMemo(() => sortRegions(pending), [pending]);

  /**
   * The values the stable callbacks below need. They are passed to memoized children (the pages and the tray cards), so they must
   * keep one identity for the life of the workspace; reading the current state from here, instead of closing over it, lets them.
   */
  const live = React.useRef({ pending, ordered, newest, doc, upload, subjectId, t, actions, rotations });
  React.useEffect(() => {
    live.current = { pending, ordered, newest, doc, upload, subjectId, t, actions, rotations };
  });

  // Escape abandons a stitch in progress.
  React.useEffect(() => {
    if (pending.length === 0) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPending([]);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending.length]);

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

  /** Crop, upload and show a problem built from one or more regions of the document. */
  const saveRegions = React.useCallback(async (regions: CropRegion[], from: DOMRect) => {
    const { doc, upload, subjectId, t, actions, rotations } = live.current;
    if (!doc || !upload) return;
    if (!subjectId) return setError(t.sources.needSubject);
    setError(null);
    try {
      // Regions are in the orientation on screen: crop them from the rotated page, so the saved image is upright …
      const crops = await Promise.all(regions.map(async (r) => cropCanvas(rotateCanvas(await doc.pageCanvas(r.page, "original"), rotations[r.page] ?? 0), r)));
      const blob = await canvasToBlob(crops.length === 1 ? crops[0] : stitchCanvases(crops), "image/jpeg", 0.92);
      // … but store them on the original page, which is what a snip's cropBox always refers to.
      const [first, ...more] = regions.map(({ page, x, y, w, h }) => ({ page, ...unrotateBox({ x, y, w, h }, rotations[page] ?? 0) }));
      const card = await actions.createProblem({
        subjectId, examUploadId: upload.id, questionLatex: "", sourcePage: first.page, cropBox: more.length > 0 ? { ...first, more } : first, originalCrop: blob,
      });
      setPending([]);
      setSelectedId(card.id);
      setFlight({ id: card.id, url: URL.createObjectURL(blob), from, to: null });
    } catch {
      setError(t.sources.tray.saveFailed);
    }
  }, []);

  /** A finished drag becomes a pending region: nothing is saved until the floating Save button is pressed. */
  const onRegion = React.useCallback((page: number, box: NormBox) => {
    const { pending, t } = live.current;
    if (pending.length >= MAX_STITCH_PARTS) return setError(format(t.sources.stitch.tooMany, { n: MAX_STITCH_PARTS }));
    setError(null);
    setPending((prev) => [...prev, { key: crypto.randomUUID(), page, ...box }]);
  }, []);

  /** Where a region currently is on screen (the page may have been scrolled or zoomed since it was drawn). */
  const regionRect = React.useCallback((region: CropRegion): DOMRect => {
    const frame = viewerRef.current?.querySelector(`[data-page="${region.page}"]`)?.getBoundingClientRect();
    return frame ? new DOMRect(frame.left + region.x * frame.width, frame.top + region.y * frame.height, region.w * frame.width, region.h * frame.height) : new DOMRect();
  }, []);

  const toolbar = React.useMemo<RegionToolbar>(
    () => ({
      saveLabel: stitching ? t.sources.stitch.save : t.sources.tools.save,
      deleteLabel: t.sources.tools.remove,
      onSave: () => {
        const { newest, ordered } = live.current;
        if (newest) void saveRegions(ordered, regionRect(newest));
      },
      // Delete takes back the newest region; the toolbar moves to the one before it.
      onDelete: () => setPending((prev) => prev.slice(0, -1)),
    }),
    [stitching, t, saveRegions, regionRect],
  );

  /** Scroll the viewer so `page` sits at the top, keeping the current zoom. */
  const goToPage = React.useCallback((page: number) => {
    const zoom = zoomRef.current;
    const frame = viewerRef.current?.querySelector(`[data-page="${page}"]`);
    const content = zoom?.instance.contentComponent;
    if (!zoom || !frame || !content) return;
    const { positionX, scale: current } = zoom.instance.state;
    const top = (frame.getBoundingClientRect().top - content.getBoundingClientRect().top) / current;
    void zoom.setTransform(positionX, -top * current + 8, current, 300, "easeOut");
  }, []);

  /** The page in the middle of the viewer, which is the one "Xoay ảnh" turns. */
  const currentPage = React.useCallback((): number => {
    const viewer = viewerRef.current;
    if (!viewer) return 1;
    const middle = viewer.getBoundingClientRect();
    const target = middle.top + middle.height / 2;
    let best = 1;
    let bestDistance = Infinity;
    viewer.querySelectorAll<HTMLElement>("[data-page]").forEach((frame) => {
      const r = frame.getBoundingClientRect();
      const distance = target < r.top ? r.top - target : target > r.bottom ? target - r.bottom : 0;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = Number(frame.dataset.page);
      }
    });
    return best;
  }, []);

  /** Turn the page in view a quarter clockwise. Pending regions on it turn with it; saved snips are stored upright and just follow. */
  const rotateCurrentPage = React.useCallback(() => {
    const page = currentPage();
    const next = rotatedPage(live.current.rotations, page);
    setRotations(next);
    setPending((prev) => prev.map((r) => (r.page === page ? { ...r, ...rotateBox(r, 1) } : r)));
    try {
      if (Object.keys(next).length === 0) localStorage.removeItem(rotationStorageKey(sourceId));
      else localStorage.setItem(rotationStorageKey(sourceId), serializeRotations(next));
    } catch {
      /* storage unavailable: the rotation lasts until the page is closed */
    }
  }, [currentPage, sourceId]);

  /** The "n / N" of the Darkroom bar, written straight to the DOM (at most every 120ms: it follows every frame of a pan or zoom). */
  const updatePageLabel = React.useCallback(() => {
    const now = performance.now();
    if (now - lastPageCheck.current < 120) return;
    lastPageCheck.current = now;
    if (pageNowRef.current) pageNowRef.current.textContent = String(currentPage());
  }, [currentPage]);

  const stepPage = React.useCallback(
    (delta: number) => {
      const total = live.current.doc?.pageCount ?? 1;
      goToPage(Math.min(total, Math.max(1, currentPage() + delta)));
    },
    [currentPage, goToPage],
  );

  const selectFromPage = React.useCallback((id: string) => {
    setSelectedId(id);
    setTrayOpen(true);
    setNotesOpen(true);
    trayRef.current?.querySelector(`[data-snip-card="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);

  const selectFromTray = React.useCallback(
    (id: string, page: number | null) => {
      setSelectedId(id);
      if (page === null) return;
      setTrayOpen(false);
      // On a phone the notes card covers the page: put it away once a card is chosen.
      if (!window.matchMedia("(min-width: 640px)").matches) setNotesOpen(false);
      // The tray is hidden on small screens until the viewer is shown again; wait a frame for it to lay out.
      requestAnimationFrame(() => goToPage(page));
    },
    [goToPage],
  );

  // Stable for the memoized pages: only a language change makes new ones.
  const pageLabels = React.useMemo(
    () => ({
      page: (n: number) => format(t.problem.page, { n }),
      snip: (n: number) => format(t.problem.label, { n }),
      part: (n: number, page: number) => format(t.sources.stitch.part, { n, page: format(t.problem.pageShort, { n: page }) }),
      rendering: t.sources.tools.rendering,
      failed: t.sources.tools.renderFailed,
    }),
    [t],
  );

  /** Saved and pending regions grouped by page, rebuilt only when the cards or the pending regions change. */
  const snipsByPage = React.useMemo(() => {
    const byPage = new Map<number, PageSnip[]>();
    snips.forEach((card, i) => {
      // Stored upright; shown at the page's current rotation.
      for (const r of cropRegions(card)) byPage.set(r.page, [...(byPage.get(r.page) ?? []), { id: card.id, number: i + 1, box: rotateBox({ x: r.x, y: r.y, w: r.w, h: r.h }, rotations[r.page] ?? 0) }]);
    });
    return byPage;
  }, [snips, rotations]);
  const pendingByPage = React.useMemo(() => {
    const byPage = new Map<number, PendingRegion[]>();
    ordered.forEach((r, i) => byPage.set(r.page, [...(byPage.get(r.page) ?? []), { key: r.key, number: i + 1, box: { x: r.x, y: r.y, w: r.w, h: r.h }, newest: r.key === newest?.key }]));
    return byPage;
  }, [ordered, newest]);

  if (!upload) {
    return (
      <div className="grid h-[calc(100dvh-var(--chrome))] place-items-center px-6">
        <div className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">{t.sources.notFound}</p>
          <Link href="/sources" className="text-sm font-medium text-brand hover:underline">
            {t.sources.back}
          </Link>
        </div>
      </div>
    );
  }

  const tool = (active: boolean) => cn("relative flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[14px] transition-colors", active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground");

  return (
    <div className={cn("flex h-[calc(100dvh-var(--chrome))] flex-col", ultra && "bg-zinc-900")}>
      {ultra && (
        <DarkroomBar
          upload={upload}
          subjectId={subjectId}
          subjects={subjects}
          title={title}
          setTitle={setTitle}
          pageCount={doc?.pageCount ?? 0}
          pageNowRef={pageNowRef}
          onStep={stepPage}
          zoomRef={zoomRef}
          zoomLabelRef={zoomLabelRef}
          snipMode={snipMode}
          panKeyOn={panKeyOn}
          setSnipMode={setSnipMode}
          onRotate={rotateCurrentPage}
          notesOpen={notesOpen}
          onNotes={() => setNotesOpen((open) => !open)}
          snipCount={snips.length}
        />
      )}
      {/* Toolbar */}
      {!ultra && (
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
          className="h-7 min-w-0 flex-1 truncate rounded-md border-2 border-transparent bg-transparent px-1.5 font-serif text-[18px] hover:border-border hover:bg-card focus-visible:border-border focus-visible:bg-card sm:max-w-sm"
        />
        {subjects.length > 0 && (
          <Select aria-label={t.problem.subject} value={subjectId ?? ""} onChange={(e) => void actions.updateSource(upload.id, { subjectId: e.target.value })} className="h-7 w-auto max-w-40 text-[14px]">
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
          <Button variant="outline" size="sm" onClick={rotateCurrentPage} title={t.sources.tools.rotateHint} className="gap-1.5">
            <RotateCw />
            {t.sources.tools.rotate}
          </Button>
          <HelpTip />
          <div className="flex items-center gap-1" role="group" aria-label={t.sources.tools.zoomIn}>
            <Button variant="outline" size="icon-sm" onClick={() => void zoomRef.current?.zoomOut(0.25, 200)} aria-label={t.sources.tools.zoomOut}>
              <Minus />
            </Button>
            <Button variant="outline" size="sm" onClick={() => void zoomRef.current?.resetTransform(250)} title={t.sources.tools.fit} className="gap-1.5 px-2.5">
              {t.sources.tools.reset}
              <span ref={zoomLabelRef} className="text-muted-foreground tabular-nums">
                100%
              </span>
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => void zoomRef.current?.zoomIn(0.25, 200)} aria-label={t.sources.tools.zoomIn}>
              <Plus />
            </Button>
          </div>
          <Button variant="outline" size="sm" className="lg:hidden" aria-pressed={trayOpen} onClick={() => setTrayOpen((v) => !v)} aria-label={trayOpen ? t.sources.tray.hide : t.sources.tray.show}>
            <PanelRight />
            <span className="tabular-nums">{snips.length}</span>
          </Button>
        </div>
      </header>
      )}

      <div className={cn("flex min-h-0 flex-1", ultra && "relative")}>
        {/* Document: pinch (or ctrl + wheel) zooms, two-finger scroll pans; dragging pans only in the Scroll tool. */}
        <div className={cn("relative flex min-w-0 flex-1 flex-col bg-sunken", ultra && "bg-zinc-800/95", !ultra && trayOpen && "hidden lg:flex")}>
          <p className={cn("z-10 shrink-0 border-b border-border bg-sunken px-4 py-1.5 text-caption text-muted-foreground", ultra && "border-zinc-700 bg-transparent text-zinc-300", ultra && !error && !panKeyOn && "hidden")} role={error ? "alert" : undefined}>
            {error ? (
              <span className="text-destructive">{error}</span>
            ) : panKeyOn ? (
              (panKeyMode === "hold" ? t.sources.tools.panHeld : t.sources.tools.panToggled)
            ) : snipMode ? (
              `${t.sources.tools.snipHint} ${panKeyMode === "hold" ? t.sources.tools.panKeyHold : t.sources.tools.panKeyToggle}`
            ) : (
              t.sources.tools.panHint
            )}
          </p>
          <div ref={viewerRef} style={{ "--zoom": 1 } as React.CSSProperties} className={cn("relative min-h-0 flex-1 overflow-hidden overscroll-contain", !cropping && "cursor-grab active:cursor-grabbing")}>
            {failed ? (
              <p role="alert" className="p-10 text-center text-sm text-destructive">
                {t.sources.fileMissing}
              </p>
            ) : !doc ? (
              <p role="status" className="p-10 text-center text-sm text-muted-foreground">
                {t.common.loading}
              </p>
            ) : (
              <TransformWrapper
                ref={zoomRef}
                minScale={MIN_SCALE}
                maxScale={MAX_SCALE}
                initialScale={1}
                limitToBounds
                centerZoomedOut
                smooth
                // Two-finger scrolling pans the document; only a pinch (ctrl + wheel on macOS) or the buttons zoom.
                // `step` is per wheel-delta unit in smooth mode, so it is kept tiny: pinch events arrive dozens per second.
                wheel={{ wheelDisabled: true, step: 0.004 }}
                pinch={{ step: 5 }}
                trackPadPanning={{ disabled: false, velocityDisabled: true }}
                panning={{ disabled: cropping, velocityDisabled: false }}
                doubleClick={{ disabled: true }}
                onTransform={(ref) => {
                  // Straight to the DOM: this fires every frame while zooming, and must not re-render the pages.
                  viewerRef.current?.style.setProperty("--zoom", String(ref.state.scale));
                  updatePageLabel();
                  if (zoomLabelRef.current) zoomLabelRef.current.textContent = `${Math.round(ref.state.scale * 100)}%`;
                }}
              >
                <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: "100%" }}>
                  <div className="mx-auto w-full max-w-[60rem] space-y-5 px-4 py-5 sm:px-6">
                    {Array.from({ length: doc.pageCount }, (_, i) => i + 1).map((page) => (
                      <div key={page} className="space-y-1.5">
                        <p className={cn("text-caption text-subtle tabular-nums", ultra && "text-zinc-400")}>{format(t.problem.page, { n: page })}</p>
                        <SourcePage
                          doc={doc}
                          page={page}
                          rotation={normalizeTurns(rotations[page] ?? 0)}
                          scrollRoot={viewerRef}
                          snips={snipsByPage.get(page) ?? NO_SNIPS}
                          pending={pendingByPage.get(page) ?? NO_PENDING}
                          toolbar={toolbar}
                          selectedId={selectedId}
                          snipMode={cropping}
                          labels={pageLabels}
                          onSnip={onRegion}
                          onSelect={selectFromPage}
                        />
                      </div>
                    ))}
                  </div>
                </TransformComponent>
              </TransformWrapper>
            )}
          </div>

          {/* Passive status while several regions are waiting; the buttons live beside the newest region. */}
          <AnimatePresence>
            {stitching && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={spring.smooth}
                role="status"
                className="pointer-events-none absolute inset-x-3 bottom-3 z-20 mx-auto flex max-w-xl flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-popover/95 px-3.5 py-2 shadow-md backdrop-blur-sm"
              >
                <p className="text-sm font-medium tabular-nums">{format(t.sources.stitch.bar, { n: pending.length })}</p>
                <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {ordered.map((region, i) => (
                    <li key={region.key} className="rounded-full bg-accent px-2.5 py-0.5 text-caption text-accent-foreground tabular-nums">
                      {format(t.sources.stitch.part, { n: i + 1, page: format(t.problem.pageShort, { n: region.page }) })}
                    </li>
                  ))}
                </ul>
                <p className="text-caption text-subtle">{t.sources.stitch.escape}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Snippets tray */}
        <aside
          ref={trayRef}
          aria-label={ultra ? t.ultra.notes : t.sources.tray.title}
          className={
            ultra
              ? cn("absolute inset-x-3 top-3 bottom-3 z-20 overflow-y-auto rounded-lg border border-border bg-background text-foreground shadow-lg sm:inset-x-auto sm:right-4 sm:w-80", notesOpen ? "block" : "hidden")
              : cn("w-full shrink-0 overflow-y-auto border-border bg-background lg:block lg:w-[400px] lg:border-l", trayOpen ? "block" : "hidden")
          }
        >
          <div className="sticky top-0 z-10 flex items-baseline justify-between border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur-sm">
            <h2 className={cn("text-heading", ultra && "text-[11px] font-normal tracking-wider text-muted-foreground uppercase")}>{ultra ? t.ultra.notes : t.sources.tray.title}</h2>
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
                {snips.map((card, i) => {
                  const subject = snapshot.subjects.find((s) => s.id === card.subjectId) ?? null;
                  return (
                    <motion.li key={card.id} layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={spring.smooth}>
                      <SnipCard
                        card={card}
                        number={i + 1}
                        selected={card.id === selectedId}
                        landing={flight?.id === card.id}
                        subject={subject}
                        aiKey={pickAiKey(snapshot.apiKeys, subject)}
                        user={snapshot.user}
                        onSelect={selectFromTray}
                        onDelete={setDeletingId}
                      />
                    </motion.li>
                  );
                })}
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
