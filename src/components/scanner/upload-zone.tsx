"use client";

import { FileUp, Loader2 } from "lucide-react";
import * as React from "react";

import { useApp } from "@/components/app-provider";
import { CrosshairCard } from "@/components/crosshair-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Drag-and-drop / file-picker for an exam PDF or phone photo. */
export function UploadZone({ busy, error, onFiles }: { busy: boolean; error: string | null; onFiles(files: File[]): void }) {
  const { t } = useApp();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [over, setOver] = React.useState(false);

  return (
    <CrosshairCard
      glow
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0 && !busy) onFiles(files);
      }}
      className={cn("flex flex-col items-center gap-4 py-14 text-center transition-colors", over && "border-primary/70 bg-accent")}
    >
      <span className="grid size-12 place-items-center rounded-xl bg-accent text-accent-foreground">
        {busy ? <Loader2 className="size-6 animate-spin" aria-hidden /> : <FileUp className="size-6" aria-hidden />}
      </span>
      <div className="space-y-1.5">
        <p className="font-medium">{busy ? t.scanner.upload.reading : t.scanner.upload.drop}</p>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">{t.scanner.upload.hint}</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif,.pdf"
        className="sr-only"
        tabIndex={-1}
        aria-label={t.scanner.upload.browse}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = ""; // allow re-selecting the same files
          if (files.length > 0) onFiles(files);
        }}
      />
      <Button size="lg" disabled={busy} onClick={() => inputRef.current?.click()}>
        {t.scanner.upload.browse}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </CrosshairCard>
  );
}
