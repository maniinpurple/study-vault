"use client";

import * as React from "react";

import { useApp } from "@/components/app-provider";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SUBJECT_COLORS, type Language } from "@/lib/constants";
import type { Subject } from "@/lib/repo/types";
import { cn } from "@/lib/utils";

const toDateInput = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/** Create (subject = undefined) or edit a subject. */
export function SubjectDialog({ open, onClose, subject }: { open: boolean; onClose: () => void; subject?: Subject }) {
  const { t } = useApp();
  return (
    <Modal open={open} onClose={onClose} title={subject ? t.subjects.editTitle : t.subjects.newTitle}>
      {/* <Modal> mounts its children only while open, so the form state re-initialises on every open. */}
      <SubjectForm subject={subject} onClose={onClose} />
    </Modal>
  );
}

function SubjectForm({ onClose, subject }: { onClose: () => void; subject?: Subject }) {
  const { t, actions } = useApp();
  const [name, setName] = React.useState(subject?.name ?? "");
  const [description, setDescription] = React.useState(subject?.description ?? "");
  const [color, setColor] = React.useState<string>(subject?.color ?? SUBJECT_COLORS[0]);
  const [examDate, setExamDate] = React.useState(toDateInput(subject?.examDate ?? null));
  const [language, setLanguage] = React.useState<Language | "">(subject?.aiOutputLanguage ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const formId = React.useId();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError(t.subjects.nameRequired);
    setBusy(true);
    try {
      const values = {
        name,
        description: description.trim() || null,
        color,
        aiOutputLanguage: language === "" ? null : language,
        examDate: examDate ? new Date(`${examDate}T00:00:00.000Z`) : null,
      };
      if (subject) await actions.updateSubject(subject.id, values);
      else await actions.createSubject(values);
      onClose();
    } catch {
      setError(t.common.errorGeneric);
      setBusy(false);
    }
  }

  return (
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label={t.subjects.name} htmlFor={`${formId}-name`} error={error}>
          <Input id={`${formId}-name`} autoFocus data-autofocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t.subjects.namePlaceholder} maxLength={80} aria-invalid={error ? true : undefined} />
        </Field>
        <Field label={`${t.subjects.description} (${t.common.optional})`} htmlFor={`${formId}-desc`}>
          <Textarea id={`${formId}-desc`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
        </Field>
        <Field label={t.subjects.color}>
          <div role="radiogroup" aria-label={t.subjects.color} className="flex flex-wrap gap-2">
            {SUBJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c === color}
                aria-label={c}
                onClick={() => setColor(c)}
                className={cn("size-7 rounded-full border-2 transition-transform hover:scale-110", c === color ? "border-foreground" : "border-transparent")}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={`${t.subjects.examDate} (${t.common.optional})`} htmlFor={`${formId}-exam`}>
            <Input id={`${formId}-exam`} type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} className="metric" />
          </Field>
          <Field label={t.subjects.aiLanguage} htmlFor={`${formId}-lang`} hint={t.subjects.aiLanguageHint}>
            <Select id={`${formId}-lang`} value={language} onChange={(e) => setLanguage(e.target.value as Language | "")}>
              <option value="">{t.subjects.followDefault}</option>
              <option value="VI">{t.language.VI}</option>
              <option value="EN">{t.language.EN}</option>
            </Select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="lg" onClick={onClose}>
            {t.common.cancel}
          </Button>
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? t.common.saving : subject ? t.common.save : t.common.create}
          </Button>
        </div>
      </form>
  );
}
