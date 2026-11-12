"use client";

import { Check, ChevronLeft, ChevronRight, FileText, Hand, ImageIcon, MousePointer2, Save, ScanLine, Square, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import { MotionConfig, motion } from "framer-motion";
import Link from "next/link";
import * as React from "react";

import { useVault } from "@/components/app-provider";
import { CrosshairCard } from "@/components/crosshair-card";
import { BoxPanel } from "@/components/scanner/box-panel";
import { DraftCard } from "@/components/scanner/draft-card";
import { PageCanvas } from "@/components/scanner/page-canvas";
import type { Draft, ScanBox } from "@/components/scanner/types";
import { UploadZone } from "@/components/scanner/upload-zone";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { SCAN_LIMITS } from "@/lib/constants";
import { format } from "@/lib/i18n";
import { OcrRequestError, requestOcr } from "@/lib/ocr-client";
import type { NewScannedCard } from "@/lib/repo/types";
import { clampBox, type NormBox } from "@/lib/scan-geometry";
import { defaultCardTitle, draftSaveProblem, mapWithConcurrency, pickOcrKey, scanAiLanguage } from "@/lib/scan-session";
import { blobToBase64, canvasToBase64Jpeg, canvasToBlob, cropCanvas, fingerprintFiles, openScanSelection, ScanDocument, ScanSourceError, type PageView } from "@/lib/scan-source";
import { cn } from "@/lib/utils";

const OCR_CONCURRENCY = 3;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5] as const;

const stripExtension = (name: string) => name.replace(/\.(pdf|png|jpe?g|webp|heic|heif)$/i, "");

export function ScannerStudio() {
  const { t, user, snapshot, activeSubjectId } = useVault();
  const { actions } = useVault();
  const subjects = React.useMemo(() => snapshot.subjects.filter((s) => s.archivedAt === null), [snapshot.subjects]);

  // ── File ────────────────────────────────────────────────────────────
  const [doc, setDoc] = React.useState<ScanDocument | null>(null);
  const [opening, setOpening] = React.useState(false);
  const [openError, setOpenError] = React.useState<string | null>(null);
  const [examTitle, setExamTitle] = React.useState("");
  const [sourceLabel, setSourceLabel] = React.useState("");
  const [subjectChoice, setSubjectChoice] = React.useState("");

  // ── Studio ──────────────────────────────────────────────────────────
  const [page, setPage] = React.useState(1);
  const [zoom, setZoom] = React.useState(1);
  const [drawMode, setDrawMode] = React.useState(true);
  const [view, setView] = React.useState<PageView>("original");
  const [display, setDisplay] = React.useState<{ key: string; canvas: HTMLCanvasElement } | null>(null);
  const [renderFailed, setRenderFailed] = React.useState(false);
  const [boxes, setBoxes] = React.useState<ScanBox[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [figureTargetId, setFigureTargetId] = React.useState<string | null>(null);
  const nextNumber = React.useRef(1);

  // ── Drafts ──────────────────────────────────────────────────────────
  const [drafts, setDrafts] = React.useState<Draft[]>([]);
  const [extracting, setExtracting] = React.useState(false);
  const [progress, setProgress] = React.useState({ done: 0, total: 0 });
  const [extractError, setExtractError] = React.useState<string | null>(null);
  /** JPEG (base64) sent to the vision model per draft; kept outside React state because it is large and never rendered. */
  const ocrImages = React.useRef(new Map<string, string>());
  const abortRef = React.useRef<AbortController | null>(null);

  const scanSubjectId = subjects.some((s) => s.id === subjectChoice) ? subjectChoice : (subjects.find((s) => s.id === activeSubjectId)?.id ?? subjects[0]?.id ?? "");
  const scanSubject = subjects.find((s) => s.id === scanSubjectId) ?? null;
  const apiKey = pickOcrKey(snapshot.apiKeys, scanSubject);

  const lockedIds = React.useMemo(() => new Set(drafts.map((d) => d.id)), [drafts]);
  const pageBoxes = React.useMemo(() => boxes.filter((b) => b.page === page), [boxes, page]);
  const selectedBox = boxes.find((b) => b.id === selectedId) ?? null;
  const dirty = boxes.length > 0 || drafts.some((d) => !d.saved);

  // ── Page rendering ──────────────────────────────────────────────────
  const viewKey = doc ? `${doc.id}:${page}:${view}` : "";
  React.useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    doc
      .pageCanvas(page, view)
      .then((canvas) => {
        if (cancelled) return;
        setDisplay({ key: viewKey, canvas });
        setRenderFailed(false);
      })
      .catch(() => {
        if (!cancelled) setRenderFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [doc, page, view, viewKey]);

  const shown = display && display.key === viewKey ? display.canvas : null;
  const aspectRatio = shown ? shown.width / shown.height : 1 / Math.SQRT2;

  // ── Lifecycle ───────────────────────────────────────────────────────
  React.useEffect(() => {
    const abort = abortRef;
    return () => abort.current?.abort();
  }, []);
  React.useEffect(() => () => doc?.destroy(), [doc]);
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function resetSession() {
    abortRef.current?.abort();
    ocrImages.current.clear();
    nextNumber.current = 1;
    setBoxes([]);
    setDrafts([]);
    setSelectedId(null);
    setFigureTargetId(null);
    setExtracting(false);
    setExtractError(null);
    setDisplay(null);
    setPage(1);
    setZoom(1);
    setView("original");
  }

  async function openFiles(selection: File[]) {
    if (dirty && !window.confirm(t.scanner.leaveWarning)) return;
    setOpening(true);
    setOpenError(null);
    try {
      const { source, files } = await openScanSelection(selection);
      let next: ScanDocument;
      try {
        next = new ScanDocument(source, files, await fingerprintFiles(files));
      } catch (err) {
        source.destroy();
        throw err;
      }
      resetSession();
      setExamTitle(stripExtension(files[0].name));
      setDoc(next);
    } catch (err) {
      setOpenError(t.scanner.errors[err instanceof ScanSourceError ? err.code : "UNREADABLE"]);
    } finally {
      setOpening(false);
    }
  }

  // ── Boxes ───────────────────────────────────────────────────────────
  const addBox = React.useCallback(
    (box: NormBox) => {
      if (boxes.length >= SCAN_LIMITS.maxBoxesPerScan) {
        setExtractError(format(t.scanner.errors.tooManyBoxes, { n: SCAN_LIMITS.maxBoxesPerScan }));
        return;
      }
      setExtractError(null);
      const created: ScanBox = { id: crypto.randomUUID(), number: nextNumber.current++, page, box, figure: null };
      setBoxes((prev) => [...prev, created]);
      setSelectedId(created.id);
    },
    [boxes.length, page, t],
  );

  const setGeometry = React.useCallback((id: string, target: "box" | "figure", box: NormBox) => {
    setBoxes((prev) => prev.map((b) => (b.id === id ? (target === "figure" ? { ...b, figure: box } : { ...b, box }) : b)));
  }, []);

  const deleteBox = React.useCallback((id: string) => {
    setBoxes((prev) => prev.filter((b) => b.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
    setFigureTargetId((cur) => (cur === id ? null : cur));
  }, []);

  function goToBox(box: ScanBox) {
    setPage(box.page);
    setSelectedId(box.id);
    setFigureTargetId(null);
  }

  // ── Extraction ──────────────────────────────────────────────────────
  const patchDraft = React.useCallback((id: string, patch: Partial<Draft>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  async function ocrImageFor(draft: Draft): Promise<string> {
    return ocrImages.current.get(draft.id) ?? blobToBase64(draft.originalBlob);
  }

  async function runOcr(draft: Draft, signal: AbortSignal) {
    if (!apiKey) {
      patchDraft(draft.id, { status: "failed", errorCode: "noKey" });
      return;
    }
    patchDraft(draft.id, { status: "processing", errorCode: null });
    try {
      const subject = subjects.find((s) => s.id === draft.subjectId) ?? scanSubject;
      const result = await requestOcr({ userId: user.id, key: apiKey, language: scanAiLanguage(subject, apiKey, user), imageBase64: await ocrImageFor(draft), signal });
      patchDraft(draft.id, { status: "done", errorCode: null, questionLatex: result.markdown, ocrRawText: result.markdown, ocrModel: result.model, ocrConfidence: result.confidence, containsFigure: result.containsFigure });
    } catch (err) {
      if (signal.aborted) return;
      patchDraft(draft.id, { status: "failed", errorCode: err instanceof OcrRequestError ? err.code : "UNKNOWN" });
    }
  }

  async function extract() {
    const pending = boxes.filter((b) => !lockedIds.has(b.id)).sort((a, b) => a.number - b.number);
    if (!doc || pending.length === 0 || extracting) return;
    setExtracting(true);
    setExtractError(null);
    const abort = new AbortController();
    abortRef.current = abort;

    try {
      // 1) Crop every box from the page bitmaps (rendering each page once).
      const prepared: Draft[] = [];
      const pages = [...new Set(pending.map((b) => b.page))];
      for (const pageNumber of pages) {
        const original = await doc.pageCanvas(pageNumber, "original");
        const visible = view === "scan" ? await doc.pageCanvas(pageNumber, "scan") : original;
        for (const b of pending.filter((x) => x.page === pageNumber)) {
          ocrImages.current.set(b.id, canvasToBase64Jpeg(cropCanvas(visible, b.box, SCAN_LIMITS.ocrLongEdge)));
          const originalBlob = await canvasToBlob(cropCanvas(original, b.box), "image/jpeg", 0.9);
          const diagramBlob = b.figure ? await canvasToBlob(cropCanvas(visible, b.figure), "image/png") : null;
          prepared.push({
            id: b.id, number: b.number, page: b.page,
            cropBox: { page: b.page, ...b.box }, figureBox: b.figure ? { page: b.page, ...b.figure } : null,
            status: apiKey ? "queued" : "failed", errorCode: apiKey ? null : "noKey",
            questionLatex: "", ocrRawText: null, ocrModel: null, ocrConfidence: null, containsFigure: false,
            originalBlob, diagramBlob,
            subjectId: scanSubjectId || null, topicId: null, title: defaultCardTitle(examTitle || doc.name, b.page, b.number, doc.pageCount),
            ahaNote: "", solution: "", teacherNote: "", isHighYield: false, tagIds: [],
            saving: false, saved: false, saveErrorCode: null,
          });
        }
      }
      setFigureTargetId(null);
      setDrafts((prev) => [...prev, ...prepared]);

      // 2) Clean-rewrite them through the user's vision model, a few at a time.
      if (apiKey) {
        setProgress({ done: 0, total: prepared.length });
        let done = 0;
        await mapWithConcurrency(prepared, OCR_CONCURRENCY, async (draft) => {
          await runOcr(draft, abort.signal);
          setProgress({ done: ++done, total: prepared.length });
        });
      }
    } catch {
      setExtractError(t.scanner.errors.renderFailed);
    } finally {
      setExtracting(false);
    }
  }

  function rerun(id: string) {
    const draft = drafts.find((d) => d.id === id);
    if (!draft) return;
    const abort = new AbortController();
    abortRef.current = abort;
    void runOcr(draft, abort.signal);
  }

  function deleteDraft(id: string) {
    ocrImages.current.delete(id);
    setDrafts((prev) => prev.filter((d) => d.id !== id)); // the box becomes editable/extractable again
  }

  // ── Saving ──────────────────────────────────────────────────────────
  async function saveDrafts(ids: string[]) {
    if (!doc) return;
    const candidates = drafts.filter((d) => ids.includes(d.id) && !d.saved && !d.saving && d.status !== "queued" && d.status !== "processing");
    const ready: Draft[] = [];
    for (const d of candidates) {
      const problem = draftSaveProblem(d);
      if (problem) patchDraft(d.id, { saveErrorCode: problem });
      else ready.push(d);
    }
    if (ready.length === 0) return;
    for (const d of ready) patchDraft(d.id, { saving: true, saveErrorCode: null });

    const cards: NewScannedCard[] = ready.map((d) => ({
      subjectId: d.subjectId!,
      topicId: d.topicId,
      title: d.title,
      questionLatex: d.questionLatex,
      ahaNote: d.ahaNote,
      solutionLatex: d.solution,
      highYieldNote: d.teacherNote,
      isHighYield: d.isHighYield,
      tagIds: d.tagIds,
      sourcePage: d.page,
      cropBox: d.cropBox,
      figureBox: d.figureBox,
      originalCrop: d.originalBlob,
      diagramImage: d.diagramBlob,
      ocrStatus: d.ocrRawText ? "DONE" : "MANUAL",
      ocrModel: d.ocrModel,
      ocrConfidence: d.ocrConfidence,
      ocrRawText: d.ocrRawText,
    }));
    try {
      await actions.saveScan({
        upload: {
          title: examTitle.trim() || stripExtension(doc.name),
          sourceLabel: sourceLabel.trim() || null,
          subjectId: scanSubjectId || null,
          fileKind: doc.source.kind,
          mimeType: doc.files[0].type || (doc.source.kind === "PDF" ? "application/pdf" : "image/jpeg"),
          fileSizeBytes: doc.totalBytes,
          pageCount: doc.pageCount,
          sha256: doc.sha256,
          files: [...doc.files],
        },
        cards,
      });
      for (const d of ready) ocrImages.current.delete(d.id);
      setDrafts((prev) => prev.map((d) => (ready.some((r) => r.id === d.id) ? { ...d, saving: false, saved: true } : d)));
    } catch {
      for (const d of ready) patchDraft(d.id, { saving: false, saveErrorCode: "saveFailed" });
    }
  }

  const unsaved = drafts.filter((d) => !d.saved);
  const savable = unsaved.filter((d) => d.status === "done" || d.status === "failed");
  const allSaved = drafts.length > 0 && unsaved.length === 0;

  // ── Render ──────────────────────────────────────────────────────────
  const stepZoom = (dir: 1 | -1) => {
    const index = ZOOM_STEPS.findIndex((z) => z >= zoom - 0.001);
    const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, (index === -1 ? ZOOM_STEPS.length - 1 : index) + dir))];
    setZoom(next);
  };
  const iconBtn = "size-8";

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t.scanner.title}</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">{t.scanner.subtitle}</p>
        </div>

        {!doc ? (
          <UploadZone busy={opening} error={openError} onFiles={(files) => void openFiles(files)} />
        ) : (
          <>
            {/* File + exam metadata */}
            <CrosshairCard className="grid gap-4 p-4 md:grid-cols-[auto_1fr_1fr_14rem] md:items-end">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">{doc.source.kind === "PDF" ? <FileText className="size-5" aria-hidden /> : <ImageIcon className="size-5" aria-hidden />}</span>
                <div className="min-w-0">
                  <p className="max-w-56 truncate text-sm font-medium" title={doc.files.map((f) => f.name).join(", ")}>{doc.name}{doc.files.length > 1 && ` ${format(t.scanner.meta.moreFiles, { n: doc.files.length - 1 })}`}</p>
                  <p className="metric text-xs text-muted-foreground">{doc.source.kind} · {format(t.scanner.meta.pages, { n: doc.pageCount })} · {(doc.totalBytes / 1048576).toFixed(1)} MB</p>
                </div>
              </div>
              <Field label={t.scanner.meta.title} htmlFor="scan-title">
                <Input id="scan-title" value={examTitle} onChange={(e) => setExamTitle(e.target.value)} placeholder={t.scanner.meta.titlePlaceholder} maxLength={120} />
              </Field>
              <Field label={`${t.scanner.meta.source} · ${t.common.optional}`} htmlFor="scan-source">
                <Input id="scan-source" value={sourceLabel} onChange={(e) => setSourceLabel(e.target.value)} placeholder={t.scanner.meta.sourcePlaceholder} maxLength={160} />
              </Field>
              <Field label={t.scanner.meta.subject} htmlFor="scan-subject">
                <Select id="scan-subject" value={scanSubjectId} onChange={(e) => setSubjectChoice(e.target.value)} disabled={extracting}>
                  {scanSubjectId === "" && <option value="">{t.scanner.meta.subjectNone}</option>}
                  {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </Field>
              <div className="flex md:col-span-4 md:justify-end">
                <Button variant="outline" size="sm" onClick={() => document.getElementById("scan-replace")?.click()}>
                  <ScanLine />
                  {t.scanner.meta.change}
                </Button>
                <input id="scan-replace" type="file" multiple className="sr-only" tabIndex={-1} aria-label={t.scanner.meta.change} accept="application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif,.pdf" onChange={(e) => { const picked = Array.from(e.target.files ?? []); e.target.value = ""; if (picked.length > 0) void openFiles(picked); }} />
              </div>
              {openError && <p role="alert" className="text-sm text-destructive md:col-span-4">{openError}</p>}
            </CrosshairCard>

            {/* Studio */}
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <CrosshairCard className="space-y-3 p-3 sm:p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1" role="group" aria-label={t.scanner.toolbar.page}>
                    <Button variant="outline" size="icon" className={iconBtn} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} aria-label={t.scanner.toolbar.prev}><ChevronLeft /></Button>
                    <span className="metric min-w-16 text-center text-sm" aria-live="polite">{page} / {doc.pageCount}</span>
                    <Button variant="outline" size="icon" className={iconBtn} onClick={() => setPage((p) => Math.min(doc.pageCount, p + 1))} disabled={page >= doc.pageCount} aria-label={t.scanner.toolbar.next}><ChevronRight /></Button>
                  </div>

                  <div className="flex items-center gap-1" role="group" aria-label="Zoom">
                    <Button variant="outline" size="icon" className={iconBtn} onClick={() => stepZoom(-1)} disabled={zoom <= ZOOM_STEPS[0]} aria-label={t.scanner.toolbar.zoomOut}><ZoomOut /></Button>
                    <button type="button" onClick={() => setZoom(1)} title={t.scanner.toolbar.fit} className="metric min-w-12 rounded px-1 text-center text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">{Math.round(zoom * 100)}%</button>
                    <Button variant="outline" size="icon" className={iconBtn} onClick={() => stepZoom(1)} disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} aria-label={t.scanner.toolbar.zoomIn}><ZoomIn /></Button>
                  </div>

                  <div className="flex overflow-hidden rounded-lg border border-border" role="group" aria-label={t.scanner.toolbar.draw}>
                    <button type="button" aria-pressed={drawMode} onClick={() => setDrawMode(true)} title={t.scanner.toolbar.drawHint} className={cn("flex h-8 items-center gap-1.5 px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", drawMode ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}><MousePointer2 className="size-4" aria-hidden />{t.scanner.toolbar.draw}</button>
                    <button type="button" aria-pressed={!drawMode} onClick={() => setDrawMode(false)} title={t.scanner.toolbar.scrollHint} className={cn("flex h-8 items-center gap-1.5 border-l border-border px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", !drawMode ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}><Hand className="size-4" aria-hidden />{t.scanner.toolbar.scroll}</button>
                  </div>

                  <Button variant="outline" size="sm" onClick={() => addBox({ x: 0.04, y: 0.04, w: 0.92, h: 0.92 })} title={t.scanner.toolbar.wholePage}><Square />{t.scanner.toolbar.wholePage}</Button>

                  <div className="ml-auto flex overflow-hidden rounded-lg border border-border" role="group" aria-label={t.scanner.toolbar.filter}>
                    {(["original", "scan"] as const).map((v, i) => (
                      <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn("h-8 px-2.5 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", i > 0 && "border-l border-border", view === v ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}>
                        {v === "original" ? t.scanner.toolbar.filterOriginal : t.scanner.toolbar.filterScan}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Context strip: figure drawing hint, or actions for the selected box. */}
                {figureTargetId && selectedBox ? (
                  <div role="status" className="flex flex-wrap items-center gap-2 rounded-lg border border-chart-3/40 bg-chart-3/10 px-3 py-2 text-sm">
                    <span>{format(t.scanner.box.drawFigureHint, { n: selectedBox.number })}</span>
                    <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setFigureTargetId(null)}><X />{t.scanner.box.cancel}</Button>
                  </div>
                ) : selectedBox && !lockedIds.has(selectedBox.id) ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                    <span className="metric font-semibold">{format(t.scanner.box.label, { n: selectedBox.number })}</span>
                    {selectedBox.page !== page && <span className="metric text-xs text-muted-foreground">p.{selectedBox.page}</span>}
                    <Button variant="outline" size="sm" onClick={() => { setPage(selectedBox.page); setDrawMode(true); setFigureTargetId(selectedBox.id); }}>
                      <ImageIcon />
                      {selectedBox.figure ? t.scanner.box.redrawFigure : t.scanner.box.keepFigure}
                    </Button>
                    {selectedBox.figure && <Button variant="ghost" size="sm" onClick={() => setBoxes((prev) => prev.map((b) => (b.id === selectedBox.id ? { ...b, figure: null } : b)))}>{t.scanner.box.removeFigure}</Button>}
                    <Button variant="ghost" size="sm" className="ml-auto text-destructive" onClick={() => deleteBox(selectedBox.id)}><Trash2 />{t.scanner.box.delete}</Button>
                  </div>
                ) : (
                  <p className="px-1 text-xs text-muted-foreground">{drawMode ? t.scanner.toolbar.drawHint : t.scanner.toolbar.scrollHint}</p>
                )}

                {renderFailed && <p role="alert" className="text-sm text-destructive">{t.scanner.errors.renderFailed}</p>}

                <PageCanvas
                  canvas={shown}
                  aspectRatio={aspectRatio}
                  zoom={zoom}
                  drawMode={drawMode}
                  boxes={shown ? pageBoxes : []}
                  lockedIds={lockedIds}
                  selectedId={selectedId}
                  figureTargetId={figureTargetId}
                  onCreate={addBox}
                  onSelect={(id) => { setSelectedId(id); if (id !== figureTargetId) setFigureTargetId(null); }}
                  onGeometry={(id, target, box) => setGeometry(id, target, clampBox(box))}
                  onFigureDrawn={(id, box) => { setGeometry(id, "figure", clampBox(box)); setFigureTargetId(null); }}
                  onCancelFigure={() => setFigureTargetId(null)}
                  onDelete={deleteBox}
                />
              </CrosshairCard>

              <div className="lg:sticky lg:top-24">
                <BoxPanel
                  boxes={[...boxes].sort((a, b) => a.number - b.number)}
                  lockedIds={lockedIds}
                  selectedId={selectedId}
                  apiKey={apiKey}
                  extracting={extracting}
                  progress={progress}
                  extractError={extractError}
                  onSelect={goToBox}
                  onDelete={deleteBox}
                  onExtract={() => void extract()}
                />
              </div>
            </div>

            {/* Draft cards */}
            {drafts.length > 0 && (
              <section aria-labelledby="drafts-heading" className="space-y-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="space-y-1">
                    <h2 id="drafts-heading" className="text-lg font-semibold tracking-tight">{t.scanner.drafts.title}</h2>
                    <p className="text-sm text-muted-foreground">{t.scanner.drafts.subtitle}</p>
                  </div>
                  {!allSaved && (
                    <Button size="lg" disabled={savable.length === 0 || extracting} onClick={() => void saveDrafts(savable.map((d) => d.id))}>
                      <Save />
                      {format(t.scanner.drafts.saveAll, { n: savable.length })}
                    </Button>
                  )}
                </div>

                {allSaved && (
                  <CrosshairCard glow className="flex flex-wrap items-center gap-4 p-4">
                    <span className="grid size-9 place-items-center rounded-full bg-accent text-accent-foreground"><Check className="size-5" aria-hidden /></span>
                    <div className="min-w-0 flex-1">
                      <p role="status" className="font-medium">{format(t.scanner.done.title, { n: drafts.length })}</p>
                      <p className="text-sm text-muted-foreground">{t.scanner.done.body}</p>
                    </div>
                    <Button variant="outline" onClick={() => { setBoxes([]); setDrafts([]); nextNumber.current = 1; ocrImages.current.clear(); setSelectedId(null); }}>{t.scanner.done.scanMore}</Button>
                    <Link href="/subjects" className="text-sm text-primary hover:underline">{t.scanner.done.viewSubjects} →</Link>
                  </CrosshairCard>
                )}

                <ul className="space-y-4">
                  {[...drafts].sort((a, b) => a.number - b.number).map((draft) => (
                    <motion.li key={draft.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                      <DraftCard
                        draft={draft}
                        subjects={subjects}
                        topics={snapshot.topics}
                        tags={snapshot.tags}
                        canRerun={apiKey !== null}
                        onChange={patchDraft}
                        onSave={(id) => void saveDrafts([id])}
                        onDelete={deleteDraft}
                        onRerun={rerun}
                      />
                    </motion.li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </MotionConfig>
  );
}
