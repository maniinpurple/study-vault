"use client";

import { Check, ImageIcon, Loader2, ScanText, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { useApp } from "@/components/app-provider";
import { CrosshairCard } from "@/components/crosshair-card";
import type { ScanBox } from "@/components/scanner/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "@/lib/i18n";
import type { UserApiKey } from "@/lib/repo/types";
import { cn } from "@/lib/utils";

interface Props {
  boxes: ScanBox[];
  lockedIds: ReadonlySet<string>;
  selectedId: string | null;
  apiKey: UserApiKey | null;
  extracting: boolean;
  progress: { done: number; total: number };
  extractError: string | null;
  onSelect(box: ScanBox): void;
  onDelete(id: string): void;
  onExtract(): void;
}

/** All drawn boxes across pages + the batch "Extract Questions" action. */
export function BoxPanel({ boxes, lockedIds, selectedId, apiKey, extracting, progress, extractError, onSelect, onDelete, onExtract }: Props) {
  const { t } = useApp();
  const pending = boxes.filter((b) => !lockedIds.has(b.id)).length;

  return (
    <CrosshairCard className="space-y-4 p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">{t.scanner.panel.title}</h2>
        {boxes.length > 0 && <p className="metric text-xs text-muted-foreground">{format(t.scanner.panel.count, { n: boxes.length, p: pending })}</p>}
      </div>

      {boxes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">{t.scanner.panel.empty}</p>
      ) : (
        <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-0.5">
          {boxes.map((b) => {
            const locked = lockedIds.has(b.id);
            return (
              <li key={b.id} className={cn("flex items-center gap-1.5 rounded-lg border bg-muted/30 pr-1", selectedId === b.id ? "border-primary/60" : "border-border")}>
                <button
                  type="button"
                  onClick={() => onSelect(b)}
                  aria-label={`${format(t.scanner.box.label, { n: b.number })} — ${format(t.scanner.panel.jump, { n: b.page })}`}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="metric font-semibold">Q{b.number}</span>
                  <span className="metric text-xs text-muted-foreground">p.{b.page}</span>
                  <span className="ml-auto flex items-center gap-1.5">
                    {b.figure && (
                      <span title={t.scanner.box.hasFigure} className="text-chart-3">
                        <ImageIcon className="size-3.5" aria-label={t.scanner.box.hasFigure} />
                      </span>
                    )}
                    {locked && (
                      <Badge variant="secondary" className="gap-1">
                        <Check />
                        {t.scanner.box.extracted}
                      </Badge>
                    )}
                  </span>
                </button>
                {!locked && (
                  <Button variant="ghost" size="icon-sm" onClick={() => onDelete(b.id)} aria-label={`${t.scanner.box.delete}: ${format(t.scanner.box.label, { n: b.number })}`}>
                    <Trash2 />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!apiKey && (
        <div role="note" className="space-y-1.5 rounded-lg border border-chart-4/30 bg-chart-4/10 p-3 text-xs">
          <p className="flex items-center gap-1.5 font-medium"><TriangleAlert className="size-3.5 text-chart-4" aria-hidden />{t.scanner.panel.noKeyTitle}</p>
          <p className="text-muted-foreground">{t.scanner.panel.noKeyBody}</p>
          <Link href="/settings#vault" className="inline-block text-primary hover:underline">{t.scanner.panel.openVault} →</Link>
        </div>
      )}
      {apiKey && <p className="metric truncate text-xs text-muted-foreground">{format(t.scanner.panel.usingKey, { label: apiKey.label, model: apiKey.visionModel ?? apiKey.defaultModel ?? "—" })}</p>}

      <div className="space-y-2">
        <Button size="lg" className="w-full" disabled={pending === 0 || extracting} onClick={onExtract}>
          {extracting ? <><Loader2 className="animate-spin" />{format(t.scanner.panel.extracting, progress)}</> : <><ScanText />{t.scanner.panel.extract}</>}
        </Button>
        {boxes.length > 0 && pending === 0 && !extracting && <p className="text-center text-xs text-muted-foreground">{t.scanner.panel.nothingToExtract}</p>}
        {extractError && <p role="alert" className="text-xs text-destructive">{extractError}</p>}
      </div>
    </CrosshairCard>
  );
}
