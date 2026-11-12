"use client";

import { X } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { useApp } from "@/components/app-provider";
import { cn } from "@/lib/utils";

/** Accessible modal built on the native <dialog> (focus trap, Esc, inert background for free). */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { t } = useApp();
  const ref = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // showModal() focuses the first focusable element (the close button), overriding React's autoFocus;
      // a child can opt in to initial focus with `data-autofocus`.
      dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={cn(
        "glass-card fixed top-1/2 left-1/2 m-0 w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-popover p-0 text-foreground",
        className,
      )}
    >
      {open && (
        <div className="space-y-5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 id={titleId} className="text-base font-semibold tracking-tight">
                {title}
              </h2>
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t.common.close}>
              <X />
            </Button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}
