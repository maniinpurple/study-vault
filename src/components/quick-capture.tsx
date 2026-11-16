"use client";

import { Plus } from "lucide-react";
import * as React from "react";

import { useVault } from "@/components/app-provider";
import { MarkdownMath } from "@/components/markdown-math";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { problemSaveIssue } from "@/lib/problems";

/** Live Markdown + KaTeX preview of what is being typed. Deferred, so typing never waits for typesetting. */
function Preview({ text, empty, label }: { text: string; empty: string; label: string }) {
  const deferred = React.useDeferredValue(text);
  return (
    <div className="space-y-1">
      <p className="text-caption font-medium text-muted-foreground">{label}</p>
      <div className="min-h-14 rounded-md border border-border bg-card px-3 py-2">
        {deferred.trim() ? <MarkdownMath text={deferred} /> : <p className="text-sm text-subtle">{empty}</p>}
      </div>
    </div>
  );
}

function CaptureForm({ onClose }: { onClose: () => void }) {
  const { snapshot, t, activeSubjectId, actions } = useVault();
  const id = React.useId();
  const subjects = snapshot.subjects.filter((s) => s.archivedAt === null);
  const [subjectId, setSubjectId] = React.useState(subjects.find((s) => s.id === activeSubjectId)?.id ?? subjects[0]?.id ?? "");
  const [statement, setStatement] = React.useState("");
  const [solution, setSolution] = React.useState("");
  // This flow exists for what was not understood in class, so it starts checked.
  const [needsReview, setNeedsReview] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const issue = problemSaveIssue({ questionLatex: statement, hasImage: false, subjectId });
    if (issue) return setError(issue === "NO_SUBJECT" ? t.capture.errors.noSubject : t.capture.errors.empty);
    setSaving(true);
    setError(null);
    try {
      await actions.createProblem({ subjectId, questionLatex: statement.trim(), solutionLatex: solution.trim() || null, needsReview });
      onClose();
    } catch {
      setError(t.capture.errors.failed);
      setSaving(false);
    }
  }

  if (subjects.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{t.capture.needSubject}</p>
        <div className="flex justify-end">
          <Button size="lg" onClick={onClose}>
            {t.common.close}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label={t.capture.subject} htmlFor={`${id}-subject`}>
        <Select id={`${id}-subject`} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>

      <div className="space-y-2">
        <Field label={t.capture.statement} htmlFor={`${id}-statement`} hint={t.capture.mathHint}>
          <Textarea id={`${id}-statement`} data-autofocus value={statement} rows={4} onChange={(e) => setStatement(e.target.value)} placeholder={t.capture.statementPlaceholder} spellCheck={false} className="font-mono text-[14px]" />
        </Field>
        <Preview text={statement} empty={t.capture.previewEmpty} label={t.capture.preview} />
      </div>

      <div className="space-y-2">
        <Field label={t.capture.solution} htmlFor={`${id}-solution`}>
          <Textarea id={`${id}-solution`} value={solution} rows={3} onChange={(e) => setSolution(e.target.value)} placeholder={t.capture.solutionPlaceholder} spellCheck={false} className="font-mono text-[14px]" />
        </Field>
        {solution.trim() && <Preview text={solution} empty="" label={t.capture.preview} />}
      </div>

      <label className="flex items-start gap-2.5 rounded-md border border-warning bg-warning-soft px-3 py-2.5">
        <input type="checkbox" checked={needsReview} onChange={(e) => setNeedsReview(e.target.checked)} className="mt-0.5 size-4 accent-[var(--primary)]" />
        <span className="space-y-0.5">
          <span className="block text-sm font-medium text-warning">{t.capture.needsReview}</span>
          <span className="block text-caption text-muted-foreground">{t.capture.needsReviewHint}</span>
        </span>
      </label>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="lg" onClick={onClose} disabled={saving}>
          {t.common.cancel}
        </Button>
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? t.capture.saving : t.capture.save}
        </Button>
      </div>
    </form>
  );
}

/** The "Ghi nhanh bài" dialog: a standalone text + LaTeX problem, typed straight into the vault. */
export function QuickCaptureDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useVault();
  return (
    <Modal open={open} onClose={onClose} title={t.capture.title} description={t.capture.subtitle} className="w-[min(42rem,calc(100vw-2rem))]">
      {/* <Modal> mounts its children only while open, so every capture starts with an empty form. */}
      <CaptureForm onClose={onClose} />
    </Modal>
  );
}

/** "+ Ghi nhanh bài": the button and its dialog. */
export function QuickCaptureButton({ variant = "default", size = "lg" }: { variant?: "default" | "outline"; size?: "default" | "lg" }) {
  const { t } = useVault();
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <Plus />
        {t.capture.open}
      </Button>
      <QuickCaptureDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
