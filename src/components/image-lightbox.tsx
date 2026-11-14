"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { TransformComponent, TransformWrapper, type ReactZoomPanPinchRef } from "react-zoom-pan-pinch";

import { useApp } from "@/components/app-provider";
import { StoredImage } from "@/components/stored-image";
import { Button } from "@/components/ui/button";

/**
 * Enlarged view of a stored image: a centered window (never full-screen) over a blurred, translucent backdrop. Pinch
 * (ctrl + wheel) or +/- to zoom, two-finger scroll or drag to pan, double-click to zoom in, Esc or a click outside to
 * close. Zoom settings match the exam viewer's.
 *
 * It is deliberately NOT a native <dialog>: a modal dialog lives in the browser's top layer, above every z-index, which
 * would hide the floating Scratchpad. This is a portal at z-60; the Scratchpad (z-70) stays above it and usable.
 * The image is only loaded while it is open.
 */
export function ImageLightbox({ open, onClose, path, alt }: { open: boolean; onClose: () => void; path: string | null; alt: string }) {
  const { t } = useApp();
  const zoom = React.useRef<ReactZoomPanPinchRef>(null);
  const closeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4 backdrop-blur-md animate-in duration-150 fade-in sm:p-8" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={alt} className="flex h-[min(85vh,52rem)] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg">
        <header className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <p className="mr-auto truncate text-heading">{alt}</p>
          <Button variant="outline" size="icon-sm" onClick={() => void zoom.current?.zoomOut(0.5, 200)} aria-label={t.sources.tools.zoomOut}>
            –
          </Button>
          <Button variant="outline" size="sm" onClick={() => void zoom.current?.resetTransform(250)}>
            {t.sources.tools.reset}
          </Button>
          <Button variant="outline" size="icon-sm" onClick={() => void zoom.current?.zoomIn(0.5, 200)} aria-label={t.sources.tools.zoomIn}>
            +
          </Button>
          <Button ref={closeRef} size="sm" onClick={onClose}>
            {t.common.close}
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden bg-sunken">
          <TransformWrapper
            ref={zoom}
            minScale={1}
            maxScale={6}
            initialScale={1}
            limitToBounds
            centerZoomedOut
            smooth
            wheel={{ wheelDisabled: true, step: 0.004 }}
            pinch={{ step: 5 }}
            trackPadPanning={{ disabled: false, velocityDisabled: true }}
            doubleClick={{ step: 0.7 }}
          >
            <TransformComponent wrapperStyle={{ width: "100%", height: "100%" }} contentStyle={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
              <StoredImage path={path} alt={alt} draggable={false} className="max-h-full max-w-full bg-white object-contain" />
            </TransformComponent>
          </TransformWrapper>
        </div>
      </div>
    </div>,
    document.body,
  );
}
