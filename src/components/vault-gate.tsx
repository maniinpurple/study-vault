"use client";

import type * as React from "react";

import { useApp } from "@/components/app-provider";

/**
 * Shows the loading state until the local vault is open, then renders its children (which may call `useVault`).
 * It lives inside each page — not in the shell — so the page segment itself is always part of the rendered UI,
 * which keeps Next's instant-navigation validation satisfied.
 */
export function VaultGate({ children }: { children: React.ReactNode }) {
  const { status, t } = useApp();
  if (status !== "ready") {
    return (
      <p role="status" className="tabular-nums py-24 text-center text-sm text-muted-foreground">
        {t.app.loading}
      </p>
    );
  }
  return <>{children}</>;
}
