"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, X } from "lucide-react";
import * as React from "react";

import { useVault } from "@/components/app-provider";
import { Dropdown, MenuItem } from "@/components/dropdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { TAG_DECLINE_REASONS, type TagDeclineReason } from "@/lib/constants";
import { format } from "@/lib/i18n";
import type { TagSuggestionFeedback } from "@/lib/repo/types";
import { tagDisplayName } from "@/lib/tags";
import { cn } from "@/lib/utils";

/**
 * Non-intrusive banner for PENDING AI tag suggestions (CREATE / RENAME). Accept applies it; Decline opens a quick
 * feedback popover whose reason is remembered in the Second Brain persona.
 * `subjectId = null` shows suggestions from every subject (labelled with the subject name).
 */
export function TagSuggestionBanner({ subjectId, className }: { subjectId: string | null; className?: string }) {
  const { snapshot, t, actions } = useVault();
  const reduceMotion = useReducedMotion();
  const [hidden, setHidden] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const liveSubjects = new Map(snapshot.subjects.filter((s) => s.archivedAt === null).map((s) => [s.id, s]));
  const pending = snapshot.tagSuggestions.filter(
    (s) => s.status === "PENDING" && s.subjectId !== null && liveSubjects.has(s.subjectId) && (subjectId === null || s.subjectId === subjectId),
  );
  const current = pending[0] ?? null;

  React.useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function accept(s: TagSuggestionFeedback) {
    setBusy(true);
    try {
      const tag = await actions.acceptTagSuggestion(s.id);
      setNotice({ tone: "ok", text: format(t.adaptive.accepted, { name: tag.name }) });
    } catch {
      setNotice({ tone: "error", text: t.common.errorGeneric });
    } finally {
      setBusy(false);
    }
  }

  async function decline(s: TagSuggestionFeedback, reason: TagDeclineReason, detail?: string) {
    setBusy(true);
    try {
      await actions.rejectTagSuggestion(s.id, reason, detail);
      setNotice({ tone: "ok", text: t.adaptive.declined });
    } catch {
      setNotice({ tone: "error", text: t.common.errorGeneric });
    } finally {
      setBusy(false);
    }
  }

  if ((!current || hidden) && !notice) return null;

  const target = current?.targetTagId ? snapshot.tags.find((tag) => tag.id === current.targetTagId) : null;
  const headline = current
    ? current.kind === "RENAME" && target
      ? format(t.adaptive.rename, { from: tagDisplayName(t, target), name: current.proposedName ?? "" })
      : format(t.adaptive.create, { name: current.proposedName ?? "" })
    : "";
  const subjectName = current?.subjectId && subjectId === null ? liveSubjects.get(current.subjectId)?.name : null;

  return (
    <div className={cn("space-y-2", className)}>
      <AnimatePresence initial={false} mode="popLayout">
        {current && !hidden && (
          <motion.section
            key={current.id}
            aria-label={t.adaptive.bannerTitle}
            initial={reduceMotion ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3.5 shadow-xs sm:flex-row sm:items-center"
          >
            <div className="flex min-w-0 flex-1 gap-3">
              <div className="min-w-0 space-y-0.5">
                <p className="text-xs text-muted-foreground">
                  {t.adaptive.bannerTitle}
                  {subjectName && <> · {subjectName}</>}
                  {current.evidenceCardIds.length > 0 && <> · {format(t.adaptive.evidence, { n: current.evidenceCardIds.length })}</>}
                  {pending.length > 1 && <> · {format(t.adaptive.more, { n: pending.length - 1 })}</>}
                </p>
                <p className="text-sm font-medium">{headline}</p>
                <p className="text-xs text-muted-foreground">{current.rationale}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-center">
              <Button size="sm" onClick={() => void accept(current)} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Check />}
                {t.adaptive.accept}
              </Button>
              <DeclinePopover disabled={busy} onDecline={(reason, detail) => void decline(current, reason, detail)} />
              <Button variant="ghost" size="icon-sm" onClick={() => setHidden(true)} aria-label={t.adaptive.hide} title={t.adaptive.hide}>
                <X />
              </Button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
      {notice && (
        <p role="status" className={cn("text-xs", notice.tone === "ok" ? "text-muted-foreground" : "text-destructive")}>
          {notice.text}
        </p>
      )}
    </div>
  );
}

function DeclinePopover({ disabled, onDecline }: { disabled: boolean; onDecline: (reason: TagDeclineReason, detail?: string) => void }) {
  const { t } = useVault();
  const [other, setOther] = React.useState<string | null>(null);
  const inputId = React.useId();

  return (
    <Dropdown
      align="end"
      className="w-72 space-y-1 p-2"
      trigger={({ open, toggle, id }) => (
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          onClick={() => {
            setOther(null);
            toggle();
          }}
        >
          {t.adaptive.decline}
        </Button>
      )}
    >
      {(close) => (
        <div role="dialog" aria-label={t.adaptive.declineTitle} className="space-y-1">
          <div className="px-2.5 pt-1 pb-1.5">
            <p className="text-sm font-medium">{t.adaptive.declineTitle}</p>
            <p className="text-xs text-muted-foreground">{t.adaptive.declineHint}</p>
          </div>
          {TAG_DECLINE_REASONS.filter((r) => r !== "other").map((reason) => (
            <MenuItem
              key={reason}
              autoFocus={reason === "too_specific"}
              onClick={() => {
                close();
                onDecline(reason);
              }}
            >
              {t.adaptive.reasons[reason]}
            </MenuItem>
          ))}
          {other === null ? (
            <MenuItem onClick={() => setOther("")}>{t.adaptive.reasons.other}</MenuItem>
          ) : (
            <form
              className="space-y-2 px-1 pt-1"
              onSubmit={(e) => {
                e.preventDefault();
                close();
                onDecline("other", other);
              }}
            >
              <label htmlFor={inputId} className="sr-only">{t.adaptive.reasons.other}</label>
              <Input id={inputId} autoFocus value={other} onChange={(e) => setOther(e.target.value)} placeholder={t.adaptive.otherPlaceholder} maxLength={280} />
              <Button type="submit" size="sm" className="w-full" disabled={!other.trim()}>
                {t.adaptive.sendFeedback}
              </Button>
            </form>
          )}
        </div>
      )}
    </Dropdown>
  );
}
