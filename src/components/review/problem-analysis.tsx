"use client";

import { Loader2 } from "lucide-react";
import * as React from "react";

import { useVault } from "@/components/app-provider";
import { MathText } from "@/components/math-text";
import { Button } from "@/components/ui/button";
import { aiErrorMessage, useSubjectAi } from "@/components/use-subject-ai";
import { requestAnalysis } from "@/lib/ai-client";
import type { MistakeCard, Subject } from "@/lib/repo/types";
import { blobToBase64 } from "@/lib/scan-source";
import type { AnalyzeResponse } from "@/lib/skills-prompt";

/** Review "Phân tích dạng toán": the problem's type and the core concept it needs, from the student's own AI key. */
export function ProblemAnalysis({ card, subject }: { card: MistakeCard; subject: Subject | null }) {
  const { t, actions } = useVault();
  const ai = useSubjectAi(subject);
  const [result, setResult] = React.useState<AnalyzeResponse | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    const abort = abortRef;
    return () => abort.current?.abort();
  }, []);

  async function analyze() {
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const call = ai.call(controller.signal);
    if (!call) return setError(t.ai.errors.NO_KEY);
    setBusy(true);
    setError(null);
    try {
      const text = card.questionLatex.trim();
      let image: { mimeType: "image/jpeg"; data: string } | undefined;
      if (!text && card.originalCropPath) {
        const blob = await actions.getBlob(card.originalCropPath);
        if (blob) image = { mimeType: "image/jpeg", data: await blobToBase64(blob) };
      }
      setResult(await requestAnalysis(call, { subjectName: subject?.name, questionLatex: text || undefined, image }));
    } catch (err) {
      if (!controller.signal.aborted) setError(aiErrorMessage(t, err));
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <section aria-labelledby={`analysis-${card.id}`} className="space-y-3 rounded-lg border border-border bg-card p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`analysis-${card.id}`} className="text-heading">
          {t.review.analysis.title}
        </h3>
        <Button variant="outline" size="sm" onClick={() => void analyze()} disabled={busy || !ai.key} title={ai.key ? t.review.analysis.hint : t.ai.noKey}>
          {busy && <Loader2 className="animate-spin" />}
          {busy ? t.review.analysis.busy : result ? t.review.analysis.again : t.review.analysis.button}
        </Button>
      </div>
      {!result && !error && <p className="text-caption text-muted-foreground">{ai.key ? t.review.analysis.hint : t.ai.noKey}</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {result && (
        <dl className="space-y-3">
          <div className="space-y-0.5">
            <dt className="text-overline">{t.review.analysis.type}</dt>
            <dd>
              <MathText text={result.type} className="text-sm font-medium" />
            </dd>
          </div>
          <div className="space-y-0.5 border-l-2 border-mark pl-3">
            <dt className="text-overline">{t.review.analysis.concept}</dt>
            <dd>
              <MathText text={result.core_concept} className="text-sm" />
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
