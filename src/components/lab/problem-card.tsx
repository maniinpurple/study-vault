"use client";

import { motion } from "framer-motion";
import { Check, Eye, EyeOff, Flag, Loader2, Trash2 } from "lucide-react";
import * as React from "react";

import { useVault } from "@/components/app-provider";
import { CrosshairCard } from "@/components/crosshair-card";
import { ExperimentalBadge } from "@/components/experimental-badge";
import { MathText } from "@/components/math-text";
import { Modal } from "@/components/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { aiErrorMessage, useSubjectAi } from "@/components/use-subject-ai";
import { requestSynthesisFix } from "@/lib/ai-client";
import { format } from "@/lib/i18n";
import type { AiSynthesizedProblem, Subject } from "@/lib/repo/types";
import type { FixResponse } from "@/lib/synth-prompt";
import { cn } from "@/lib/utils";

/** One AI-synthesized problem. The experimental badge is unconditional (CLAUDE.md §4.6). */
export function ProblemCard({ problem, subject, highlight }: { problem: AiSynthesizedProblem; subject: Subject; highlight?: boolean }) {
  const { snapshot, user, t, locale, actions } = useVault();
  const [open, setOpen] = React.useState(false);
  const [reporting, setReporting] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: user.timezone });
  const sources = snapshot.synthesisSources
    .filter((s) => s.problemId === problem.id)
    .map((s) => snapshot.cards.find((c) => c.id === s.cardId))
    .filter((c) => c !== undefined);

  async function promote() {
    setBusy(true);
    try {
      await actions.promoteSynthesizedProblem(problem.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div initial={highlight ? { opacity: 0, y: 12 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <CrosshairCard glow={highlight} className={cn("space-y-4 p-5", highlight && "border-brand")}>
        <div className="flex flex-wrap items-center gap-2">
          <ExperimentalBadge label={t.synth.experimentalBadge} />
          <Badge variant="secondary">{t.lab.modeLabel[problem.mode]}</Badge>
          {problem.difficultyEstimate !== null && <Badge variant="outline" className="tabular-nums">{format(t.lab.difficulty, { n: problem.difficultyEstimate })}</Badge>}
          {problem.usedHighYield && <Badge variant="outline">{t.review.highYield}</Badge>}
          {problem.revision > 0 && <Badge variant="outline" className="tabular-nums">{format(t.lab.revision, { n: problem.revision })}</Badge>}
          {problem.isFlaggedIncorrect && (
            <Badge variant="destructive">
              <Flag />
              {t.lab.flagged}
            </Badge>
          )}
          <span className="tabular-nums ml-auto text-[11px] text-muted-foreground">{dateFmt.format(problem.createdAt)}</span>
        </div>

        <MathText text={problem.questionLatex} className="text-reading" />

        {problem.diagramDescription && (
          <div className="flex gap-2 rounded-lg border border-dashed border-border p-3 text-sm">
            <div className="space-y-0.5">
              <p className="text-xs font-medium text-muted-foreground">{t.lab.diagram}</p>
              <MathText text={problem.diagramDescription} />
            </div>
          </div>
        )}

        {sources.length > 0 && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">{format(t.lab.sourcesCount, { n: sources.length })}</summary>
            <ul className="mt-2 space-y-1.5 border-l border-border pl-3">
              {sources.map((card) => (
                <li key={card.id} className="line-clamp-2">
                  
                  {card.title ?? card.questionLatex.slice(0, 120)}
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? <EyeOff /> : <Eye />}
            {open ? t.lab.hideAnswer : t.lab.showAnswer}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setReporting(true)}>
            {t.lab.report}
          </Button>
          {problem.promotedCardId ? (
            <Badge variant="secondary" className="gap-1">
              <Check />
              {t.lab.promoted}
            </Badge>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => void promote()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {t.lab.promote}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto"
            aria-label={t.lab.delete}
            title={t.lab.delete}
            onClick={() => {
              if (window.confirm(t.lab.deleteConfirm)) void actions.deleteSynthesizedProblem(problem.id);
            }}
          >
            <Trash2 />
          </Button>
        </div>

        {open && (
          <div className="space-y-3">
            {problem.answerLatex && (
              <section className="rounded-lg border border-primary/30 bg-accent/40 p-3">
                <h3 className="text-[11px] font-medium text-muted-foreground">{t.lab.answer}</h3>
                <MathText text={problem.answerLatex} />
              </section>
            )}
            {problem.solutionLatex && (
              <section className="space-y-1">
                <h3 className="text-xs font-semibold">{t.lab.solution}</h3>
                <MathText text={problem.solutionLatex} />
              </section>
            )}
            {problem.verificationLatex && (
              <details className="rounded-lg border border-border bg-muted/30 p-3">
                <summary className="flex cursor-pointer items-center gap-1.5 text-xs font-medium">
                  {t.lab.verification}
                </summary>
                <MathText text={problem.verificationLatex} className="mt-2 text-xs" />
              </details>
            )}
          </div>
        )}

        <Modal open={reporting} onClose={() => setReporting(false)} title={t.lab.reportTitle} description={t.lab.reportBody} className="w-[min(40rem,calc(100vw-2rem))]">
          <ReportForm problem={problem} subject={subject} onDone={() => setOpen(true)} />
        </Modal>
      </CrosshairCard>
    </motion.div>
  );
}

function ReportForm({ problem, subject, onDone }: { problem: AiSynthesizedProblem; subject: Subject; onDone: () => void }) {
  const { t, actions } = useVault();
  const ai = useSubjectAi(subject);
  const [report, setReport] = React.useState(problem.flagReason ?? "");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<FixResponse | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const id = React.useId();

  React.useEffect(() => {
    const abort = abortRef;
    return () => abort.current?.abort();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = report.trim();
    if (text.length < 3) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const call = ai.call(controller.signal);
    // The report is stored first, so the flag survives even if the AI check fails.
    await actions.updateSynthesizedProblem(problem.id, { isFlaggedIncorrect: true, flagReason: text });
    if (!call) return setError(t.ai.errors.NO_KEY);
    setBusy(true);
    setError(null);
    try {
      const fix = await requestSynthesisFix(call, {
        subjectName: subject.name,
        problem: { questionLatex: problem.questionLatex, answerLatex: problem.answerLatex, solutionLatex: problem.solutionLatex },
        report: text,
      });
      if (fix.verdict === "FIXED") {
        await actions.updateSynthesizedProblem(problem.id, {
          questionLatex: fix.questionLatex, answerLatex: fix.answerLatex, solutionLatex: fix.solutionLatex, verificationLatex: fix.verificationLatex,
          isFlaggedIncorrect: false, aiModel: fix.model, revised: true,
        });
      } else {
        await actions.updateSynthesizedProblem(problem.id, { isFlaggedIncorrect: false, verificationLatex: fix.verificationLatex });
      }
      setResult(fix);
      onDone();
    } catch (err) {
      if (!controller.signal.aborted) setError(aiErrorMessage(t, err));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-3" role="status">
        <p className={cn("flex items-center gap-2 text-sm font-medium", result.verdict === "FIXED" ? "text-primary" : "text-foreground")}>
          {result.verdict === "FIXED" ? t.lab.fixed : t.lab.noError}
        </p>
        <MathText text={result.explanation} className="rounded-lg border border-border bg-muted/30 p-3" />
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label htmlFor={id} className="sr-only">{t.lab.reportTitle}</label>
      <Textarea id={id} data-autofocus value={report} onChange={(e) => setReport(e.target.value)} placeholder={t.lab.reportPlaceholder} rows={4} maxLength={1500} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={busy || report.trim().length < 3}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          {busy ? t.lab.reportChecking : t.lab.reportSend}
        </Button>
      </div>
    </form>
  );
}
