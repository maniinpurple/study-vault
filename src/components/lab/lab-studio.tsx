"use client";

import { MotionConfig } from "framer-motion";
import { Loader2, Save, Trash2 } from "lucide-react";
import * as React from "react";

import { useVault } from "@/components/app-provider";
import { CrosshairCard } from "@/components/crosshair-card";
import { ExperimentalBadge } from "@/components/experimental-badge";
import { ProblemCard } from "@/components/lab/problem-card";
import { MathText } from "@/components/math-text";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { aiErrorMessage, useSubjectAi } from "@/components/use-subject-ai";
import { requestSynthesis } from "@/lib/ai-client";
import { SYNTH_PROMPT_VERSION, SYNTHESIS_MIX_MAX_SOURCES, type SynthesisMode } from "@/lib/constants";
import { format } from "@/lib/i18n";
import { buildSynthesizeRequest, cardsInScope, pickMixSources, rankWeakCards, topicPath } from "@/lib/lab";
import type { ExamPrepSession, Subject } from "@/lib/repo/types";
import { tagDisplayName, tagsForSubject } from "@/lib/tags";
import { cn } from "@/lib/utils";

const MAX_LISTED_SOURCES = 12;

export function LabStudio() {
  const { snapshot, t, activeSubjectId, actions } = useVault();
  const subjects = snapshot.subjects.filter((s) => s.archivedAt === null);
  const subject = subjects.find((s) => s.id === activeSubjectId) ?? subjects[0] ?? null;

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        <header className="space-y-1.5">
          <h1 className="text-display">{t.lab.title}</h1>
          <p className="max-w-xl text-muted-foreground">{t.lab.subtitle}</p>
        </header>
        {subject ? (
          // Keyed by subject: scope, mode and picks reset when the subject changes.
          <LabWorkspace key={subject.id} subject={subject} subjects={subjects} onSubject={(id) => actions.setActiveSubject(id)} />
        ) : (
          <CrosshairCard className="space-y-2 py-12 text-center">
            <p className="text-sm font-medium">{t.lab.noSubjects}</p>
          </CrosshairCard>
        )}
      </div>
    </MotionConfig>
  );
}

function LabWorkspace({ subject, subjects, onSubject }: { subject: Subject; subjects: Subject[]; onSubject: (id: string) => void }) {
  const { snapshot, t, loadedAt, actions } = useVault();
  const ai = useSubjectAi(subject);
  const id = React.useId();

  const [topicIds, setTopicIds] = React.useState<string[]>([]);
  const [tagIds, setTagIds] = React.useState<string[]>([]);
  const [highYieldOnly, setHighYieldOnly] = React.useState(false);
  const [presetId, setPresetId] = React.useState<string | null>(null);
  const [presetName, setPresetName] = React.useState("");
  const [mode, setMode] = React.useState<SynthesisMode>("MIX");
  const [mixCount, setMixCount] = React.useState(2);
  const [picked, setPicked] = React.useState<string[] | null>(null);
  const [generating, setGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [latestId, setLatestId] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    const abort = abortRef;
    return () => abort.current?.abort();
  }, []);

  const topics = snapshot.topics.filter((tp) => tp.subjectId === subject.id);
  const chapters = topics.filter((tp) => tp.parentId === null);
  const tags = tagsForSubject(snapshot.tags, subject.id);
  const presets = snapshot.examPrepSessions.filter((p) => p.subjectId === subject.id);
  // The synthesizer reads question text, so image-only problems cannot be sources until they are converted.
  const inScopeAll = cardsInScope(snapshot.cards, { subjectId: subject.id, topicIds, tagIds, highYieldOnly }, snapshot.topics, snapshot.cardTags);
  const scoped = inScopeAll.filter((c) => c.questionLatex.trim().length > 0);
  const imageOnly = inScopeAll.length - scoped.length;
  const ranked = rankWeakCards(scoped, snapshot.logs, loadedAt);
  const target = mode === "CLONE" ? 1 : mixCount;
  const autoPick = mode === "CLONE" ? ranked.slice(0, 1).map((r) => r.card.id) : pickMixSources(ranked, mixCount).map((c) => c.id);
  const inScope = new Set(scoped.map((c) => c.id));
  const pickedIds = (picked ?? autoPick).filter((cardId) => inScope.has(cardId)).slice(0, target);
  const listed = [...ranked.filter((r) => pickedIds.includes(r.card.id)), ...ranked.filter((r) => !pickedIds.includes(r.card.id))].slice(0, MAX_LISTED_SOURCES);
  const problems = snapshot.synthesizedProblems.filter((p) => p.subjectId === subject.id);
  const canGenerate = Boolean(ai.key) && pickedIds.length === target && !generating;

  function changeScope(update: () => void) {
    update();
    setPresetId(null);
    setPicked(null);
  }

  function toggleTopic(topicId: string) {
    changeScope(() => {
      const topic = topics.find((tp) => tp.id === topicId);
      if (!topic) return;
      setTopicIds((current) => {
        const set = new Set(current);
        if (topic.parentId === null) {
          const family = [topic.id, ...topics.filter((tp) => tp.parentId === topic.id).map((tp) => tp.id)];
          if (set.has(topic.id)) family.forEach((x) => set.delete(x));
          else family.forEach((x) => set.add(x));
        } else if (set.has(topic.id)) {
          set.delete(topic.id);
          set.delete(topic.parentId); // a chapter id means "the whole chapter"
        } else {
          set.add(topic.id);
        }
        return [...set];
      });
    });
  }

  function applyPreset(preset: ExamPrepSession) {
    setTopicIds(preset.topicIds);
    setTagIds(preset.tagIds);
    setHighYieldOnly(preset.highYieldOnly);
    setPresetId(preset.id);
    setPicked(null);
  }

  async function savePreset(e: React.FormEvent) {
    e.preventDefault();
    if (!presetName.trim()) return;
    const created = await actions.createExamPrepSession({ subjectId: subject.id, title: presetName, topicIds, tagIds, highYieldOnly });
    setPresetId(created.id);
    setPresetName("");
  }

  function togglePick(cardId: string) {
    setPicked(() => {
      if (mode === "CLONE") return [cardId];
      if (pickedIds.includes(cardId)) return pickedIds.filter((x) => x !== cardId);
      return [...pickedIds, cardId].slice(-target);
    });
  }

  async function generate() {
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const call = ai.call(controller.signal);
    if (!call || !ai.key) return setError(t.ai.errors.NO_KEY);
    const sources = pickedIds.map((cardId) => scoped.find((c) => c.id === cardId)!).filter(Boolean);
    setGenerating(true);
    setError(null);
    try {
      const request = buildSynthesizeRequest({ mode, subject, scopeTopicIds: topicIds, topics: snapshot.topics, sources, logs: snapshot.logs, persona: snapshot.persona });
      const result = await requestSynthesis(call, request);
      const saved = await actions.saveSynthesizedProblem({
        subjectId: subject.id, examPrepSessionId: presetId, mode, questionLatex: result.questionLatex, answerLatex: result.answerLatex, solutionLatex: result.solutionLatex,
        diagramDescription: result.diagramDescription, difficultyEstimate: result.difficultyEstimate, verificationLatex: result.verificationLatex,
        usedHighYield: sources.some((c) => c.isHighYield), outputLanguage: ai.language, apiKeyId: ai.key.id, aiProvider: ai.key.provider, aiModel: result.model,
        promptVersion: SYNTH_PROMPT_VERSION, sourceCardIds: sources.map((c) => c.id),
      });
      setLatestId(saved.id);
    } catch (err) {
      if (!controller.signal.aborted) setError(aiErrorMessage(t, err));
    } finally {
      if (!controller.signal.aborted) setGenerating(false);
    }
  }

  const chip = (on: boolean) =>
    cn(
      "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
      on ? "border-primary/70 bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      {/* ── Scope + generator ─────────────────────────────────────── */}
      <div className="min-w-0 space-y-6">
        <CrosshairCard className="space-y-5">
          <div className="space-y-1">
            <h2 className="text-heading">{t.lab.scope}</h2>
            <p className="text-xs text-muted-foreground">{t.lab.scopeHint}</p>
          </div>

          <Field label={t.lab.subject} htmlFor={`${id}-subject`}>
            <Select id={`${id}-subject`} value={subject.id} onChange={(e) => onSubject(e.target.value)}>
              {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>

          {presets.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium">{t.lab.presets}</p>
              <ul className="flex flex-wrap gap-1.5">
                {presets.map((preset) => (
                  <li key={preset.id} className="flex items-center">
                    <button type="button" aria-pressed={presetId === preset.id} onClick={() => applyPreset(preset)} className={chip(presetId === preset.id)}>
                      {preset.title}
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={format(t.lab.deletePreset, { name: preset.title })}
                      title={format(t.lab.deletePreset, { name: preset.title })}
                      onClick={() => {
                        if (presetId === preset.id) setPresetId(null);
                        void actions.deleteExamPrepSession(preset.id);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <fieldset className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <legend className="text-xs font-medium">{t.lab.topics}</legend>
              <div className="flex gap-1">
                <Button variant="ghost" size="xs" onClick={() => changeScope(() => setTopicIds(topics.map((tp) => tp.id)))} disabled={topics.length === 0}>{t.lab.selectAll}</Button>
                <Button variant="ghost" size="xs" onClick={() => changeScope(() => setTopicIds([]))} disabled={topicIds.length === 0}>{t.lab.clear}</Button>
              </div>
            </div>
            {topicIds.length === 0 && <p className="text-xs text-muted-foreground">{t.lab.wholeSubject}</p>}
            <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {chapters.map((chapter) => {
                const children = topics.filter((tp) => tp.parentId === chapter.id);
                const some = children.some((c) => topicIds.includes(c.id));
                return (
                  <li key={chapter.id} className="space-y-1">
                    <CheckRow checked={topicIds.includes(chapter.id)} indeterminate={!topicIds.includes(chapter.id) && some} onChange={() => toggleTopic(chapter.id)} label={chapter.name} bold />
                    {children.length > 0 && (
                      <ul className="ml-5 space-y-1 border-l border-border pl-3">
                        {children.map((child) => (
                          <li key={child.id}>
                            <CheckRow checked={topicIds.includes(child.id)} onChange={() => toggleTopic(child.id)} label={child.name} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </fieldset>

          {tags.length > 0 && (
            <div className="space-y-1.5" role="group" aria-label={t.lab.tags}>
              <p className="text-xs font-medium">{t.lab.tags}</p>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => {
                  const on = tagIds.includes(tag.id);
                  return (
                    <button key={tag.id} type="button" aria-pressed={on} className={chip(on)} onClick={() => changeScope(() => setTagIds((c) => (on ? c.filter((x) => x !== tag.id) : [...c, tag.id])))}>
                      <span className="size-1.5 rounded-full" style={{ backgroundColor: tag.color ?? "var(--muted-foreground)" }} aria-hidden />
                      {tagDisplayName(t, tag)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="button"
            role="switch"
            aria-checked={highYieldOnly}
            onClick={() => changeScope(() => setHighYieldOnly((v) => !v))}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              highYieldOnly ? "border-transparent bg-mark-soft text-mark-foreground" : "border-border hover:bg-muted",
            )}
          >
            <span>{t.lab.highYieldOnly}</span>
            <span aria-hidden className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", highYieldOnly ? "bg-mark-foreground" : "bg-secondary")}>
              <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left]", highYieldOnly ? "left-[1.1rem]" : "left-0.5")} />
            </span>
          </button>

          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm font-medium tabular-nums">{format(t.lab.inScope, { n: scoped.length })}</p>
            {imageOnly > 0 && <p className="text-caption text-muted-foreground">{format(t.lab.imageOnly, { n: imageOnly })}</p>}
            <form onSubmit={savePreset} className="flex gap-1.5">
              <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder={t.lab.presetName} aria-label={t.lab.presetName} maxLength={80} className="h-8 min-w-0 flex-1" />
              <Button type="submit" variant="outline" size="default" disabled={!presetName.trim()}>
                <Save />
                {t.lab.savePreset}
              </Button>
            </form>
          </div>
        </CrosshairCard>

        <CrosshairCard className="space-y-5">
          <div className="space-y-2" role="radiogroup" aria-label={t.lab.mode}>
            <p className="text-heading">{t.lab.mode}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["CLONE", "MIX"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => {
                    setMode(m);
                    setPicked(null);
                  }}
                  className={cn(
                    "space-y-1 rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    mode === m ? "border-primary/70 bg-accent" : "border-border hover:bg-muted/50",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    {m === "CLONE" ? t.lab.modeA : t.lab.modeB}
                  </span>
                  <span className="block text-xs text-muted-foreground">{m === "CLONE" ? t.lab.modeAHint : t.lab.modeBHint}</span>
                </button>
              ))}
            </div>
            {mode === "MIX" && (
              <div className="flex items-center gap-2 pt-1 text-xs">
                <span className="text-muted-foreground">{t.lab.mixCount}</span>
                {[2, SYNTHESIS_MIX_MAX_SOURCES].map((n) => (
                  <button key={n} type="button" aria-pressed={mixCount === n} onClick={() => { setMixCount(n); setPicked(null); }} className={chip(mixCount === n)}>
                    <span className="tabular-nums">{n}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-heading">{t.lab.sources}</p>
                <p className="text-xs text-muted-foreground">{format(t.lab.sourcesHint, { n: target })}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="tabular-nums text-xs text-muted-foreground">{format(t.lab.picked, { n: pickedIds.length, max: target })}</span>
                <Button variant="ghost" size="xs" onClick={() => setPicked(null)} disabled={picked === null}>
                  {t.lab.autoPick}
                </Button>
              </div>
            </div>
            {listed.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">{t.lab.emptyScope}</p>
            ) : (
              <ul className="space-y-1.5">
                {listed.map(({ card, score }) => {
                  const on = pickedIds.includes(card.id);
                  return (
                    <li key={card.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => togglePick(card.id)}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-lg border p-2.5 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                          on ? "border-primary/70 bg-accent/60" : "border-border hover:bg-muted/50",
                        )}
                      >
                        <span aria-hidden className={cn("mt-0.5 grid size-4 shrink-0 place-items-center border", mode === "CLONE" ? "rounded-full" : "rounded", on ? "border-primary bg-primary" : "border-input")}>
                          {on && <span className={cn("bg-primary-foreground", mode === "CLONE" ? "size-1.5 rounded-full" : "size-2 rounded-[2px]")} />}
                        </span>
                        <span className="min-w-0 flex-1 space-y-1">
                          <span className="flex flex-wrap items-center gap-1.5 text-[14px] text-muted-foreground">
                            {card.isHighYield && <span className="font-medium text-mark-foreground">{t.review.highYield}</span>}
                            {topicPath(card.topicId, snapshot.topics) ?? card.title}
                            <span className="tabular-nums ml-auto">{format(t.lab.weakness, { n: score.toFixed(1) })}</span>
                          </span>
                          <MathText text={card.questionLatex} className="line-clamp-2 text-[14px]" />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="space-y-2 border-t border-border pt-4">
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              {subject.memorySummary ? format(t.lab.memoryInjected, { v: subject.memoryVersion }) : t.lab.memoryMissing}
            </p>
            {!ai.key && <p className="text-xs text-destructive">{t.ai.noKey}</p>}
            <ExperimentalBadge label={t.synth.experimentalBadge} />
            <Button size="lg" className="w-full" onClick={() => void generate()} disabled={!canGenerate}>
              {generating ? <Loader2 className="animate-spin" /> : null}
              {generating ? t.lab.generating : t.lab.generate}
            </Button>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
        </CrosshairCard>
      </div>

      {/* ── Generated problems ────────────────────────────────────── */}
      <section aria-labelledby={`${id}-history`} className="min-w-0 space-y-4">
        <h2 id={`${id}-history`} className="text-heading">
          {t.lab.history} <span className="tabular-nums font-normal text-muted-foreground">· {problems.length}</span>
        </h2>
        {problems.length === 0 ? (
          <CrosshairCard className="space-y-2 py-12 text-center">
            <p className="text-sm text-muted-foreground">{t.lab.historyEmpty}</p>
          </CrosshairCard>
        ) : (
          problems.map((problem) => <ProblemCard key={problem.id} problem={problem} subject={subject} highlight={problem.id === latestId} />)
        )}
      </section>
    </div>
  );
}

function CheckRow({ checked, indeterminate, onChange, label, bold }: { checked: boolean; indeterminate?: boolean; onChange: () => void; label: string; bold?: boolean }) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-muted/50">
      <input ref={ref} type="checkbox" checked={checked} onChange={onChange} className="size-4 accent-[var(--primary)]" />
      <span className={cn("truncate", bold && "font-medium")}>{label}</span>
    </label>
  );
}
