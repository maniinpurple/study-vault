"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Check, Eye, Loader2, Plus, Shuffle, Undo2 } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { useVault } from "@/components/app-provider";
import { TagSuggestionBanner } from "@/components/brain/tag-suggestion-banner";
import { CardDiagram } from "@/components/card-diagram";
import { StoredImage } from "@/components/stored-image";
import { CrosshairCard } from "@/components/crosshair-card";
import { ExperimentalBadge } from "@/components/experimental-badge";
import { ImageLightbox } from "@/components/image-lightbox";
import { MathText } from "@/components/math-text";
import { ProblemAnalysis } from "@/components/review/problem-analysis";
import { AttemptLog, RATING_DOT } from "@/components/review/attempt-log";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/field";
import { aiErrorMessage, useSubjectAi } from "@/components/use-subject-ai";
import { requestMutation } from "@/lib/ai-client";
import { swatchColor } from "@/lib/constants";
import { RATINGS, type RatingName } from "@/lib/fsrs";
import { format, type Dictionary } from "@/lib/i18n";
import type { MistakeCard, Subject } from "@/lib/repo/types";
import { attemptHistory, buildReviewQueue, dueCountsBySubject, intervalParts, previewIntervals } from "@/lib/review";
import type { MutateResponse } from "@/lib/synth-prompt";
import { timezoneOffsetMinutes } from "@/lib/stats";
import { tagDisplayName, tagsForSubject } from "@/lib/tags";
import { cn } from "@/lib/utils";

const LATER_TICK_MS = 15_000;

function intervalLabel(t: Dictionary, locale: string, ms: number): string {
  const { unit, n } = intervalParts(ms);
  return format(t.review.units[unit], { n: n.toLocaleString(locale) });
}

export function ReviewArena() {
  const { snapshot, user, t, locale, loadedAt, activeSubjectId, actions } = useVault();
  const [tick, setTick] = React.useState<Date | null>(null);
  const [pinnedId, setPinnedId] = React.useState<string | null>(null);
  const [studyAhead, setStudyAhead] = React.useState(false);
  const [reviewed, setReviewed] = React.useState<{ count: number; subjects: string[] }>({ count: 0, subjects: [] });
  const [toast, setToast] = React.useState<string | null>(null);

  // Session clock: every save reloads the snapshot (new `loadedAt`); while waiting on learning steps a slow tick advances it.
  const now = tick && tick > loadedAt ? tick : loadedAt;
  const offset = timezoneOffsetMinutes(user.timezone, now);
  const subjects = snapshot.subjects.filter((s) => s.archivedAt === null);
  const scopeSubject = subjects.find((s) => s.id === activeSubjectId) ?? null;
  const queue = buildReviewQueue(snapshot.cards, now, { subjectId: scopeSubject?.id ?? null, utcOffsetMinutes: offset, learnAheadMinutes: studyAhead ? 24 * 60 : undefined });
  const counts = dueCountsBySubject(snapshot.cards, now, offset);

  // A card pinned mid-review (answer shown, note typed) stays on screen — but never across a subject filter change.
  const pinned = pinnedId ? (snapshot.cards.find((c) => c.id === pinnedId && c.archivedAt === null && (!scopeSubject || c.subjectId === scopeSubject.id)) ?? null) : null;
  const current = pinned ?? queue.ready[0] ?? null;
  const waiting = !current && queue.later.length > 0;

  React.useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => setTick(new Date()), LATER_TICK_MS);
    return () => window.clearInterval(timer);
  }, [waiting]);

  React.useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const timeFmt = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: user.timezone });
  const staleSubjects = subjects.filter((s) => reviewed.subjects.includes(s.id) && s.memoryStale);

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h1 className="text-display">{t.review.title}</h1>
            <p className="max-w-xl text-muted-foreground">{t.review.subtitle}</p>
            <div className="flex items-center gap-2 pt-1.5">
              <label htmlFor="review-subject" className="text-sm text-muted-foreground">
                {t.review.scope}
              </label>
              <span className="relative">
                {scopeSubject && <span className="pointer-events-none absolute top-1/2 left-3 size-2 -translate-y-1/2 rounded-full" style={{ backgroundColor: swatchColor(scopeSubject.color) ?? "var(--subtle-foreground)" }} aria-hidden />}
                <Select id="review-subject" value={scopeSubject?.id ?? ""} onChange={(e) => actions.setActiveSubject(e.target.value || null)} className={cn("h-9 w-auto min-w-48 font-medium", scopeSubject && "pl-7")}>
                  <option value="">{t.subjects.all}</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {counts.get(s.id) ?? 0}
                    </option>
                  ))}
                </Select>
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs" aria-live="polite">
            <Badge className="tabular-nums">{format(t.review.dueNow, { n: queue.ready.length })}</Badge>
            {queue.later.length > 0 && <Badge variant="secondary" className="tabular-nums">{format(t.review.laterToday, { n: queue.later.length })}</Badge>}
            {reviewed.count > 0 && <Badge variant="outline" className="tabular-nums">{format(t.review.progress, { done: reviewed.count, left: queue.ready.length + queue.later.length })}</Badge>}
          </div>
        </header>

        <TagSuggestionBanner subjectId={scopeSubject?.id ?? null} />

        <div aria-live="polite" className="min-h-0">
          {toast && (
            <p role="status" className="flex items-center gap-2 rounded-lg border border-primary/30 bg-accent px-3 py-2 text-sm text-accent-foreground">
              {toast}
            </p>
          )}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {current ? (
            // Keyed by attempt too: a card failed with "Again" can come straight back and must start fresh.
            <motion.div key={`${current.id}:${current.attemptCount}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
              <ReviewCard
                card={current}
                subject={subjects.find((s) => s.id === current.subjectId) ?? null}
                onPin={() => setPinnedId(current.id)}
                onGraded={({ attemptNumber, dueAfter, reviewedAt }) => {
                  setPinnedId(null);
                  setReviewed((r) => ({ count: r.count + 1, subjects: r.subjects.includes(current.subjectId) ? r.subjects : [...r.subjects, current.subjectId] }));
                  setToast(format(t.review.saved, { attempt: format(t.review.attemptNo, { n: attemptNumber }), interval: intervalLabel(t, locale, dueAfter.getTime() - reviewedAt.getTime()) }));
                }}
              />
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
              <CrosshairCard glow={reviewed.count > 0} className="space-y-4 py-12 text-center">
                {waiting ? (
                  <>
                    <div className="space-y-1">
                      <h2 className="text-title">{t.review.laterTitle}</h2>
                      <p className="text-sm text-muted-foreground">
                        {format(t.review.laterBody, { n: queue.later.length, time: queue.nextReadyAt ? timeFmt.format(queue.later[0].due) : "—" })}
                      </p>
                    </div>
                    <Button variant="outline" size="lg" onClick={() => setStudyAhead(true)}>
                      {t.review.studyAhead}
                    </Button>
                  </>
                ) : (
                  <>
                                        <div className="space-y-1">
                      <h2 className="text-title">{reviewed.count > 0 ? t.review.doneTitle : t.review.emptyTitle}</h2>
                      <p className="text-sm text-muted-foreground">{reviewed.count > 0 ? format(t.review.doneBody, { n: reviewed.count }) : t.review.emptyBody}</p>
                    </div>
                  </>
                )}
                {staleSubjects.length > 0 && (
                  <div className="mx-auto flex max-w-xl flex-col items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm sm:flex-row sm:text-left">
                    <p className="flex-1 text-muted-foreground">{t.review.memoryHint}</p>
                    <Link
                      href="/subjects"
                      onClick={() => actions.setActiveSubject(staleSubjects[0].id)}
                      className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-brand outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {t.review.openSubject}
                    </Link>
                  </div>
                )}
                <div className="flex flex-wrap justify-center gap-2">
                  <Link href="/lab" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground outline-none hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50">
                    {t.review.toLab}
                  </Link>
                  <Link href="/sources" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
                    {t.review.toScanner}
                  </Link>
                </div>
              </CrosshairCard>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

interface CardProps {
  card: MistakeCard;
  subject: Subject | null;
  onPin: () => void;
  onGraded: (result: { attemptNumber: number; dueAfter: Date; reviewedAt: Date }) => void;
}

/** One card in the arena. Mounted per card (keyed), so reveal/variant/note state resets between cards. */
function ReviewCard({ card, subject, onPin, onGraded }: CardProps) {
  const { snapshot, t, locale, actions } = useVault();
  const ai = useSubjectAi(subject);
  const [revealed, setRevealed] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [variant, setVariant] = React.useState<MutateResponse | null>(null);
  const [showVariant, setShowVariant] = React.useState(true);
  const [mutating, setMutating] = React.useState(false);
  const [mutateError, setMutateError] = React.useState<string | null>(null);
  const [grading, setGrading] = React.useState<RatingName | null>(null);
  const [gradeError, setGradeError] = React.useState<string | null>(null);
  const [solutionDraft, setSolutionDraft] = React.useState<string | null>(null);
  const [zoomed, setZoomed] = React.useState(false);
  const shownAt = React.useRef(0);
  const abortRef = React.useRef<AbortController | null>(null);
  const noteId = React.useId();

  React.useEffect(() => {
    shownAt.current = Date.now();
    const abort = abortRef;
    return () => abort.current?.abort();
  }, []);

  const attempts = attemptHistory(card.id, snapshot.logs);
  const nextAttempt = card.attemptCount + 1;
  const intervals = previewIntervals();
  const topic = card.topicId ? snapshot.topics.find((tp) => tp.id === card.topicId) : null;
  const subjectTags = tagsForSubject(snapshot.tags, card.subjectId);
  const cardTagIds = new Set(snapshot.cardTags.filter((l) => l.cardId === card.id).map((l) => l.tagId));
  const variantActive = variant !== null && showVariant;
  const hasSolution = Boolean(card.solutionLatex || card.correctAnswerLatex);
  const hasText = card.questionLatex.trim().length > 0;

  const reveal = React.useCallback(() => {
    onPin();
    setRevealed(true);
  }, [onPin]);

  const grade = React.useCallback(
    async (rating: RatingName) => {
      if (grading) return;
      onPin();
      setGrading(rating);
      setGradeError(null);
      try {
        const reviewedAt = new Date();
        const { log } = await actions.reviewCard({
          cardId: card.id,
          rating,
          reviewedAt,
          note,
          variantQuestionLatex: variant && showVariant ? variant.questionLatex : null,
          timeSpentMs: shownAt.current ? Date.now() - shownAt.current : null,
        });
        onGraded({ attemptNumber: log.attemptNumber, dueAfter: log.dueAfter, reviewedAt });
      } catch {
        setGradeError(t.review.saveFailed);
        setGrading(null);
      }
    },
    [actions, card.id, grading, note, onGraded, onPin, showVariant, t.review.saveFailed, variant],
  );

  // Keyboard: Space reveals, 1–4 grade (ignored while typing in a field).
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (el?.closest("input, textarea, select, [contenteditable='true'], dialog, [role='dialog']")) return;
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        // Space/Enter on a focused control activates that control instead.
        if (el?.closest("button, a, summary")) return;
        e.preventDefault();
        reveal();
      } else if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
        e.preventDefault();
        void grade(RATINGS[Number(e.key) - 1]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [grade, reveal, revealed]);

  async function mutate() {
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const call = ai.call(controller.signal);
    onPin();
    if (!call) {
      setMutateError(t.ai.errors.NO_KEY);
      return;
    }
    setMutating(true);
    setMutateError(null);
    try {
      const result = await requestMutation(call, {
        subjectName: subject?.name ?? "",
        questionLatex: card.questionLatex,
        solutionLatex: [card.correctAnswerLatex, card.solutionLatex].filter(Boolean).join("\n\n") || null,
        hasDiagram: card.diagramImagePath !== null,
      });
      setVariant(result);
      setShowVariant(true);
    } catch (err) {
      if (!controller.signal.aborted) setMutateError(aiErrorMessage(t, err));
    } finally {
      if (!controller.signal.aborted) setMutating(false);
    }
  }

  async function toggleTag(tagId: string) {
    onPin();
    const next = new Set(cardTagIds);
    if (next.has(tagId)) next.delete(tagId);
    else next.add(tagId);
    await actions.setCardTags(card.id, [...next]).catch(() => undefined);
  }

  async function saveSolution() {
    if (!solutionDraft?.trim()) return;
    await actions.updateCard(card.id, { solutionLatex: solutionDraft });
    setSolutionDraft(null);
  }

  return (
    <div className={cn("grid gap-5", hasText ? "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]")}>
      {/* ── Question face ─────────────────────────────────────────── */}
      <CrosshairCard glow className="min-w-0 space-y-4 self-start p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {subject && (
            <span className="flex items-center gap-1.5 font-medium">
              <span className="size-2 rounded-full" style={{ backgroundColor: subject.color ?? "var(--primary)" }} aria-hidden />
              {subject.name}
            </span>
          )}
          {topic && <span className="text-muted-foreground">· {topic.name}</span>}
          <Badge variant="secondary">{t.review.state[card.state]}</Badge>
          {card.needsReview && <Badge variant="destructive">{t.problem.needsReview}</Badge>}
          {card.isHighYield && <Badge variant="outline">{t.review.highYield}</Badge>}
          <span className="tabular-nums ml-auto text-muted-foreground">{format(t.review.attemptNo, { n: nextAttempt })}</span>
        </div>
        {card.title && <h2 className="text-sm font-semibold text-muted-foreground">{card.title}</h2>}

        {variantActive && variant ? (
          <div className="space-y-3">
            <ExperimentalBadge label={t.review.variantBadge} />
            <MathText text={variant.questionLatex} className="text-reading" />
            <p className="text-xs text-muted-foreground">{format(t.review.variantChanges, { changes: variant.changes })}</p>
            {card.diagramImagePath && <p className="text-xs text-muted-foreground">{t.review.diagramOriginal}</p>}
          </div>
        ) : (
          hasText ? <MathText text={card.questionLatex} className="text-reading" /> : (
            <button type="button" onClick={() => setZoomed(true)} aria-label={`${t.problem.imageAlt}. ${t.review.zoomImage}`} className="group/image relative block w-full cursor-zoom-in overflow-hidden rounded-md border border-border bg-white">
              <StoredImage path={card.originalCropPath} alt="" className="mx-auto block max-h-[72vh] min-h-48 w-full object-contain" />
              <span className="absolute right-2 bottom-2 rounded-full bg-popover/90 px-2.5 py-1 text-caption opacity-0 shadow-xs transition-opacity group-hover/image:opacity-100 group-focus-visible/image:opacity-100">{t.review.zoomImage}</span>
            </button>
          )
        )}
        <CardDiagram path={card.diagramImagePath} alt={t.review.figure} caption={t.review.figure} />

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {variant ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowVariant((v) => !v)} aria-pressed={!showVariant}>
                <Shuffle />
                {showVariant ? t.review.showOriginal : t.review.showVariant}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setVariant(null)}>
                <Undo2 />
                {t.review.discardVariant}
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => void mutate()} disabled={mutating || !ai.key || !hasText} title={ai.key ? t.review.mutateHint : t.ai.noKey}>
              {mutating && <Loader2 className="animate-spin" />}
              {mutating ? t.review.mutating : t.review.mutate}
            </Button>
          )}
          {!revealed && (
            <Button size="lg" className="ml-auto" onClick={reveal}>
              <Eye />
              {t.review.reveal}
            </Button>
          )}
        </div>
        {!variant && !mutating && <p className="text-xs text-muted-foreground">{ai.key ? t.review.mutateHint : t.ai.noKey}</p>}
        {mutateError && <p role="alert" className="text-sm text-destructive">{mutateError}</p>}
        <p className="hidden items-center gap-1.5 text-[12px] text-muted-foreground sm:flex">
          {t.review.shortcuts}
        </p>
      </CrosshairCard>

      {/* ── Reveal: solution, notes, attempt log, reflection, grading ── */}
      {revealed ? (
        <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.22 }} className="min-w-0 space-y-4">
          <CrosshairCard className="space-y-4 p-5">
            {variant && (
              <section className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
                <ExperimentalBadge label={t.review.variantBadge} />
                <h3 className="text-xs font-semibold">{t.review.variantAnswer}</h3>
                <MathText text={variant.answerLatex} />
                <details className="group">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">{t.review.variantSolution}</summary>
                  <MathText text={variant.solutionLatex} className="mt-2" />
                </details>
              </section>
            )}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold">{t.review.solution}</h3>
              {card.correctAnswerLatex && (
                <div className="rounded-lg border border-primary/30 bg-accent/40 p-2.5">
                  <p className="text-[12px] font-medium text-muted-foreground">{t.review.correctAnswer}</p>
                  <MathText text={card.correctAnswerLatex} />
                </div>
              )}
              {card.solutionLatex && <MathText text={card.solutionLatex} />}
              {!hasSolution &&
                (solutionDraft === null ? (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">{t.review.noSolution}</p>
                    <Button variant="outline" size="sm" onClick={() => setSolutionDraft("")}>
                      <Plus />
                      {t.review.addSolution}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Textarea value={solutionDraft} onChange={(e) => setSolutionDraft(e.target.value)} placeholder={t.review.solutionPlaceholder} rows={3} className="tabular-nums text-[14px]" aria-label={t.review.addSolution} />
                    {solutionDraft.trim() && <MathText text={solutionDraft} className="rounded-lg border border-border p-2" />}
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setSolutionDraft(null)}>{t.common.cancel}</Button>
                      <Button size="sm" onClick={() => void saveSolution()} disabled={!solutionDraft.trim()}>{t.common.save}</Button>
                    </div>
                  </div>
                ))}
            </section>
            {(card.ahaNote || card.highYieldNote) && (
              <section className="grid gap-2 sm:grid-cols-2">
                {card.ahaNote && (
                  <div className="rounded-lg border border-border bg-muted/30 p-2.5">
                    <p className="text-[12px] font-medium text-muted-foreground">{t.review.ahaNote}</p>
                    <MathText text={card.ahaNote} />
                  </div>
                )}
                {card.highYieldNote && (
                  <div className="rounded-lg border border-border bg-muted/30 p-2.5">
                    <p className="text-[12px] font-medium text-muted-foreground">{t.review.teacherNote}</p>
                    <MathText text={card.highYieldNote} />
                  </div>
                )}
              </section>
            )}
          </CrosshairCard>

          <ProblemAnalysis card={card} subject={subject} />

          <CrosshairCard className="space-y-3 p-5">
            <h3 className="text-xs font-semibold">{t.review.history}</h3>
            <AttemptLog attempts={attempts} />
          </CrosshairCard>

          <CrosshairCard className="space-y-4 p-5">
            <div className="space-y-1.5">
              <label htmlFor={noteId} className="text-xs font-semibold">
                {format(t.review.reflection, { attempt: format(t.review.attemptNo, { n: nextAttempt }) })}
              </label>
              <Textarea id={noteId} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.review.reflectionPlaceholder} rows={2} maxLength={2000} />
            </div>
            {subjectTags.length > 0 && (
              <div className="space-y-1.5" role="group" aria-label={t.review.errorTags}>
                <p className="text-xs font-semibold">{t.review.errorTags}</p>
                <div className="flex flex-wrap gap-1.5">
                  {subjectTags.map((tag) => {
                    const on = cardTagIds.has(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => void toggleTag(tag.id)}
                        className={cn(
                          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                          on ? "border-primary/70 bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <span className="size-1.5 rounded-full" style={{ backgroundColor: tag.color ?? "var(--muted-foreground)" }} aria-hidden />
                        {tagDisplayName(t, tag)}
                        {on && <Check className="size-3" aria-hidden />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <p className="text-xs font-semibold">{t.review.grade}</p>
              <div className="grid grid-cols-2 gap-2">
                {RATINGS.map((rating, i) => (
                  <button
                    key={rating}
                    type="button"
                    onClick={() => void grade(rating)}
                    disabled={grading !== null}
                    className={cn(
                      "group flex flex-col items-start gap-1 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-left transition-colors outline-none hover:border-primary/50 hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
                      grading === rating && "border-primary/70 bg-accent",
                    )}
                  >
                    <span className="flex w-full items-center gap-1.5 text-sm leading-snug font-medium">
                      <span className={cn("size-2 shrink-0 rounded-full", RATING_DOT[rating])} aria-hidden />
                      <span className="min-w-0 flex-1">{t.review.ratings[rating]}</span>
                      <kbd className="hidden rounded border border-border px-1 font-mono text-[12px] text-subtle sm:inline">{i + 1}</kbd>
                    </span>
                    <span className="tabular-nums text-xs text-muted-foreground">{grading === rating ? <Loader2 className="size-3 animate-spin" aria-hidden /> : intervalLabel(t, locale, intervals[rating])}</span>
                  </button>
                ))}
              </div>
              {gradeError && <p role="alert" className="text-sm text-destructive">{gradeError}</p>}
            </div>
          </CrosshairCard>
        </motion.div>
      ) : (
        <div className="hidden lg:block" aria-hidden />
      )}
      <ImageLightbox open={zoomed} onClose={() => setZoomed(false)} path={card.originalCropPath} alt={t.problem.imageAlt} />
    </div>
  );
}
