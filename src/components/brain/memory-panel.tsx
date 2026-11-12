"use client";

import { Brain, Eye, Loader2 } from "lucide-react";
import * as React from "react";

import { useVault } from "@/components/app-provider";
import { CrosshairCard } from "@/components/crosshair-card";
import { MathText } from "@/components/math-text";
import { Modal } from "@/components/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { aiErrorMessage, useSubjectAi } from "@/components/use-subject-ai";
import { requestMemorySync } from "@/lib/ai-client";
import { buildMemorySyncRequest, EMPTY_INSIGHTS, normalizeInsights } from "@/lib/brain";
import { format } from "@/lib/i18n";
import type { Subject, SubjectMemoryInsights } from "@/lib/repo/types";
import { cn } from "@/lib/utils";

const INSIGHT_KEYS = ["blindSpots", "overcome", "thinkingPatterns", "teacherEmphasis", "nextFocus"] as const satisfies readonly (keyof SubjectMemoryInsights)[];

/** "AI Second Brain" card inside a subject: compressed memory, insights, Re-sync button and the inspect/edit modal. */
export function MemoryPanel({ subject }: { subject: Subject }) {
  const { snapshot, user, t, locale, actions } = useVault();
  const ai = useSubjectAi(subject);
  const [syncing, setSyncing] = React.useState(false);
  const [notice, setNotice] = React.useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [inspecting, setInspecting] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    const abort = abortRef;
    return () => abort.current?.abort();
  }, []);

  const subjectCards = snapshot.cards.filter((c) => c.subjectId === subject.id && c.archivedAt === null);
  const insights = subject.memoryInsights ?? EMPTY_INSIGHTS;
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: user.timezone });
  const status = subject.memoryUpdatedAt === null ? "never" : subject.memoryStale ? "stale" : "fresh";

  async function resync() {
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const call = ai.call(controller.signal);
    if (!call || !ai.key) return setNotice({ tone: "error", text: t.ai.errors.NO_KEY });
    const request = buildMemorySyncRequest({
      subject, cards: snapshot.cards, logs: snapshot.logs, topics: snapshot.topics, tags: snapshot.tags, cardTags: snapshot.cardTags,
      persona: snapshot.persona, suggestions: snapshot.tagSuggestions, dictionary: t,
    });
    if (!request) return setNotice({ tone: "error", text: t.brain.noCards });
    setSyncing(true);
    setNotice(null);
    try {
      const result = await requestMemorySync(call, request);
      const cardIds = new Set(subjectCards.map((c) => c.id));
      const created = await actions.applyMemorySync(subject.id, result, {
        sourceCardCount: request.totalCards,
        sourceAttemptCount: snapshot.logs.filter((l) => cardIds.has(l.cardId)).length,
        suggestionMeta: { aiProvider: ai.key.provider, aiModel: result.model, outputLanguage: ai.language },
      });
      setNotice({ tone: "ok", text: created.length > 0 ? format(t.brain.syncedWithTags, { n: created.length }) : format(t.brain.synced, { v: subject.memoryVersion + 1 }) });
    } catch (err) {
      if (!controller.signal.aborted) setNotice({ tone: "error", text: aiErrorMessage(t, err) });
    } finally {
      if (!controller.signal.aborted) setSyncing(false);
    }
  }

  return (
    <CrosshairCard glow className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-glow-from to-glow-to text-white">
              <Brain className="size-4" aria-hidden />
            </span>
            <h2 className="text-base font-semibold tracking-tight">{t.brain.title}</h2>
            <Badge variant={status === "fresh" ? "secondary" : status === "stale" ? "destructive" : "outline"}>{t.brain[status]}</Badge>
          </div>
          <p className="max-w-2xl text-xs text-muted-foreground">{t.brain.subtitle}</p>
          {subject.memoryUpdatedAt && (
            <p className="metric text-[11px] text-muted-foreground">
              {format(t.brain.meta, { v: subject.memoryVersion, n: subject.memorySourceCardCount, date: dateFmt.format(subject.memoryUpdatedAt) })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="lg" onClick={() => setInspecting(true)}>
            <Eye />
            {t.brain.inspect}
          </Button>
          <Button size="lg" onClick={() => void resync()} disabled={syncing || !ai.key || subjectCards.length === 0} className="bg-gradient-to-r from-glow-from to-glow-to text-white hover:opacity-90">
            {syncing ? <Loader2 className="animate-spin" /> : null}
            {syncing ? format(t.brain.resyncing, { n: Math.min(subjectCards.length, 60) }) : t.brain.resync}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{!ai.key ? t.ai.noKey : subjectCards.length === 0 ? t.brain.noCards : t.brain.resyncHint}</p>
      {notice && (
        <p role={notice.tone === "error" ? "alert" : "status"} className={cn("text-sm", notice.tone === "error" ? "text-destructive" : "text-primary")}>
          {notice.text}
        </p>
      )}

      {subject.memorySummary ? (
        <div className="space-y-4">
          <MathText text={subject.memorySummary} className="rounded-lg border border-border bg-background/40 p-3.5" />
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {INSIGHT_KEYS.filter((key) => insights[key].length > 0).map((key) => (
              <div key={key} className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-3">
                <dt className="text-xs font-semibold">{t.brain.insights[key]}</dt>
                <dd>
                  <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground marker:text-primary">
                    {insights[key].map((item, i) => <li key={i}><MathText text={item} className="text-xs" /></li>)}
                  </ul>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">{t.brain.empty}</p>
      )}

      <Modal open={inspecting} onClose={() => setInspecting(false)} title={format(t.brain.inspectTitle, { subject: subject.name })} description={t.brain.inspectBody} className="w-[min(48rem,calc(100vw-2rem))]">
        <MemoryEditor subject={subject} onClose={() => setInspecting(false)} />
      </Modal>
    </CrosshairCard>
  );
}

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

/** Inspect/edit form. Mounted only while the modal is open, so it always starts from the stored memory. */
function MemoryEditor({ subject, onClose }: { subject: Subject; onClose: () => void }) {
  const { snapshot, t, actions } = useVault();
  const persona = snapshot.persona;
  const id = React.useId();
  const [summary, setSummary] = React.useState(subject.memorySummary ?? "");
  const [insightText, setInsightText] = React.useState<Record<(typeof INSIGHT_KEYS)[number], string>>(() => {
    const source = subject.memoryInsights ?? EMPTY_INSIGHTS;
    return Object.fromEntries(INSIGHT_KEYS.map((k) => [k, source[k].join("\n")])) as Record<(typeof INSIGHT_KEYS)[number], string>;
  });
  const [personaSummary, setPersonaSummary] = React.useState(persona?.summary ?? "");
  const [strengths, setStrengths] = React.useState((persona?.strengths ?? []).join("\n"));
  const [weaknesses, setWeaknesses] = React.useState((persona?.weaknesses ?? []).join("\n"));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const feedback = (persona?.preferences?.tagFeedback ?? []).filter((f) => f.subjectId === null || f.subjectId === subject.id);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const nextInsights = normalizeInsights(Object.fromEntries(INSIGHT_KEYS.map((k) => [k, lines(insightText[k])])));
      const hasInsights = INSIGHT_KEYS.some((k) => nextInsights[k].length > 0);
      await actions.saveSubjectMemory(subject.id, { memorySummary: summary, memoryInsights: hasInsights ? nextInsights : null, source: "edit" });
      const personaChanged =
        personaSummary.trim() !== (persona?.summary ?? "") || strengths.trim() !== (persona?.strengths ?? []).join("\n") || weaknesses.trim() !== (persona?.weaknesses ?? []).join("\n");
      if (personaChanged) await actions.updatePersona({ summary: personaSummary, strengths: lines(strengths), weaknesses: lines(weaknesses) });
      onClose();
    } catch {
      setError(t.common.errorGeneric);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <Field label={t.brain.summary} htmlFor={`${id}-summary`}>
        <Textarea id={`${id}-summary`} value={summary} onChange={(e) => setSummary(e.target.value)} rows={5} maxLength={4000} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        {INSIGHT_KEYS.map((key) => (
          <Field key={key} label={t.brain.insights[key]} htmlFor={`${id}-${key}`} hint={t.brain.insightsHint}>
            <Textarea id={`${id}-${key}`} value={insightText[key]} onChange={(e) => setInsightText((prev) => ({ ...prev, [key]: e.target.value }))} rows={3} className="text-xs" />
          </Field>
        ))}
      </div>

      <fieldset className="space-y-3 rounded-lg border border-border p-3.5">
        <legend className="px-1 text-xs font-semibold">{t.brain.persona}</legend>
        <p className="text-xs text-muted-foreground">{persona?.summary || persona?.strengths.length ? t.brain.personaHint : t.brain.personaEmpty}</p>
        <Textarea aria-label={t.brain.persona} value={personaSummary} onChange={(e) => setPersonaSummary(e.target.value)} rows={3} maxLength={2400} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t.brain.strengths} htmlFor={`${id}-strengths`} hint={t.brain.insightsHint}>
            <Textarea id={`${id}-strengths`} value={strengths} onChange={(e) => setStrengths(e.target.value)} rows={3} className="text-xs" />
          </Field>
          <Field label={t.brain.weaknesses} htmlFor={`${id}-weaknesses`} hint={t.brain.insightsHint}>
            <Textarea id={`${id}-weaknesses`} value={weaknesses} onChange={(e) => setWeaknesses(e.target.value)} rows={3} className="text-xs" />
          </Field>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs font-semibold">{t.brain.tagPreferences}</p>
          {feedback.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t.brain.tagPreferencesEmpty}</p>
          ) : (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {feedback.slice(0, 8).map((f, i) => (
                <li key={`${f.at}-${i}`}>
                  “{f.proposedName ?? "—"}” — {f.reason === "other" && f.detail ? `“${f.detail}”` : t.adaptive.reasons[f.reason]}
                </li>
              ))}
            </ul>
          )}
        </div>
      </fieldset>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="lg" onClick={onClose}>{t.common.cancel}</Button>
        <Button type="submit" size="lg" disabled={busy}>{busy ? t.common.saving : t.brain.saveEdits}</Button>
      </div>
    </form>
  );
}
