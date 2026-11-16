"use client";

import Link from "next/link";
import * as React from "react";
import type { ReactZoomPanPinchRef } from "react-zoom-pan-pinch";

import { useVault } from "@/components/app-provider";
import { HelpTip } from "@/components/sources/help-tip";
import type { ExamUpload, Subject } from "@/lib/repo/types";
import { cn } from "@/lib/utils";

/** A plain-text control on the dark bar. */
const text = "text-sm whitespace-nowrap text-zinc-300 transition-colors hover:text-white disabled:opacity-40";
const on = "font-medium text-white";

interface Props {
  upload: ExamUpload;
  subjectId: string | null;
  subjects: Subject[];
  title: string;
  setTitle: (title: string) => void;
  pageCount: number;
  /** Written straight to the DOM by the viewer while it pans or zooms; never React state. */
  pageNowRef: React.RefObject<HTMLSpanElement | null>;
  onStep: (delta: number) => void;
  zoomRef: React.RefObject<ReactZoomPanPinchRef | null>;
  zoomLabelRef: React.RefObject<HTMLSpanElement | null>;
  snipMode: boolean;
  panKeyOn: boolean;
  setSnipMode: (snip: boolean) => void;
  onRotate: () => void;
  notesOpen: boolean;
  onNotes: () => void;
  snipCount: number;
}

/**
 * The Darkroom bar of Ultra-minimal (`/sources/[id]`): one slim, always-dark strip with the whole viewer toolbar as plain text.
 * Left: back, the breadcrumb (Sources / subject / title, both editable in place) and its due date. Center: pages, zoom, rotate and
 * the select-area / pan tool. Right: status, notes and download. It drives the same zoom, rotation, tool and notes state as the
 * Standard toolbar, so nothing is lost.
 */
export function DarkroomBar({ upload, subjectId, subjects, title, setTitle, pageCount, pageNowRef, onStep, zoomRef, zoomLabelRef, snipMode, panKeyOn, setSnipMode, onRotate, notesOpen, onNotes, snipCount }: Props) {
  const { t, actions } = useVault();
  const [downloading, setDownloading] = React.useState(false);
  const subject = subjects.find((s) => s.id === subjectId) ?? null;

  /** The original file (a PDF), or each photo of the exam in page order. */
  async function download() {
    setDownloading(true);
    try {
      const paths = upload.fileKind === "PDF" || upload.pageStoragePaths.length === 0 ? [upload.storagePath] : upload.pageStoragePaths;
      for (const [i, path] of paths.entries()) {
        const blob = await actions.getBlob(path);
        if (!blob) continue;
        const ext = path.split(".").pop() ?? (upload.fileKind === "PDF" ? "pdf" : "jpg");
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `${upload.title}${paths.length > 1 ? `-${i + 1}` : ""}.${ext}`;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
      }
    } finally {
      setDownloading(false);
    }
  }

  const tool = panKeyOn || !snipMode ? "pan" : "snip";

  return (
    <header className="flex h-12 shrink-0 items-center gap-5 overflow-x-auto border-b lg:overflow-visible border-zinc-800 bg-zinc-900 px-4 text-zinc-200">
      <div className="flex min-w-0 shrink-0 items-center gap-4">
        <Link href="/sources" aria-label={t.sources.back} className={text}>
          <span aria-hidden>‹ </span>
          {t.sources.back}
        </Link>
        <div className="min-w-0 leading-tight">
          <p className="flex min-w-0 items-center gap-1.5 text-[13px]">
            <Link href="/sources" className="text-zinc-400 hover:text-white">
              {t.nav.sources}
            </Link>
            <span aria-hidden className="text-zinc-600">
              /
            </span>
            {subjects.length > 0 && (
              <>
                <select
                  aria-label={t.problem.subject}
                  value={subjectId ?? ""}
                  onChange={(e) => void actions.updateSource(upload.id, { subjectId: e.target.value })}
                  className="max-w-32 truncate border-0 bg-transparent p-0 text-[13px] text-zinc-300 [color-scheme:dark] hover:text-white"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <span aria-hidden className="text-zinc-600">
                  /
                </span>
              </>
            )}
            <input
              value={title}
              aria-label={t.sources.titleLabel}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title.trim() !== upload.title && void actions.updateSource(upload.id, { title })}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className="w-[min(26ch,28vw)] truncate border-0 bg-transparent p-0 text-[13px] font-medium text-zinc-100 hover:underline hover:underline-offset-4 focus-visible:underline"
            />
          </p>
          <p className="flex items-center gap-1.5 text-[11px] text-zinc-400">
            {subject && <span className="truncate">{subject.name}</span>}
            {subject && <span aria-hidden>·</span>}
            <label htmlFor="darkroom-due" className="shrink-0">
              {t.ultra.dueLabel}
            </label>
            <input
              id="darkroom-due"
              type="date"
              value={upload.deadline ?? ""}
              title={upload.deadline ? t.homework.deadline : t.ultra.noDue}
              onChange={(e) => void actions.updateSource(upload.id, { deadline: e.target.value || null }).catch(() => undefined)}
              className="h-4 w-[6.6rem] border-0 bg-transparent p-0 text-[11px] text-zinc-300 [color-scheme:dark] tabular-nums"
            />
          </p>
        </div>
      </div>

      <div className="mx-auto flex shrink-0 items-center gap-5">
        <div className="flex items-center gap-2 text-sm tabular-nums" role="group" aria-label={t.problem.page.replace("{n}", "")}>
          <button type="button" onClick={() => onStep(-1)} aria-label={t.ultra.previousPage} className={text}>
            ‹
          </button>
          <span>
            <span ref={pageNowRef}>1</span> / {pageCount || "–"}
          </span>
          <button type="button" onClick={() => onStep(1)} aria-label={t.ultra.nextPage} className={text}>
            ›
          </button>
        </div>
        <div className="flex items-center gap-2 text-sm tabular-nums" role="group" aria-label={t.sources.tools.zoomIn}>
          <button type="button" onClick={() => void zoomRef.current?.zoomOut(0.25, 200)} aria-label={t.sources.tools.zoomOut} className={text}>
            −
          </button>
          <button type="button" onClick={() => void zoomRef.current?.resetTransform(250)} title={t.sources.tools.fit} className={cn(text, "min-w-10 text-center")}>
            <span ref={zoomLabelRef}>100%</span>
          </button>
          <button type="button" onClick={() => void zoomRef.current?.zoomIn(0.25, 200)} aria-label={t.sources.tools.zoomIn} className={text}>
            +
          </button>
        </div>
        <button type="button" onClick={onRotate} title={t.sources.tools.rotateHint} className={text}>
          {t.sources.tools.rotate}
        </button>
        <button
          type="button"
          onClick={() => setSnipMode(!snipMode)}
          aria-pressed={tool === "snip"}
          title={tool === "snip" ? t.sources.tools.snipHint : t.sources.tools.panHint}
          className={cn(text, tool === "snip" ? on : "text-zinc-300")}
        >
          {tool === "snip" ? t.ultra.selectArea : t.ultra.panning}
        </button>
        <HelpTip buttonClassName="border-zinc-600 bg-transparent text-zinc-300 hover:text-white" />
      </div>

      <div className="flex shrink-0 items-center gap-5">
        <button
          type="button"
          aria-pressed={upload.completed}
          onClick={() => void actions.updateSource(upload.id, { completed: !upload.completed }).catch(() => undefined)}
          className={cn(text, upload.completed && "text-emerald-400 hover:text-emerald-300")}
        >
          {upload.completed ? t.homework.done : t.homework.todo}
        </button>
        <button type="button" aria-pressed={notesOpen} onClick={onNotes} className={cn(text, notesOpen && on)}>
          {t.ultra.notes}
          {snipCount > 0 && <span className="ml-1.5 text-xs text-zinc-400 tabular-nums">{snipCount}</span>}
        </button>
        <button type="button" onClick={() => void download()} disabled={downloading} className={text}>
          {downloading ? t.ultra.downloading : t.ultra.download}
        </button>
      </div>
    </header>
  );
}
