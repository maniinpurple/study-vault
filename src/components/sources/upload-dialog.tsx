"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { useVault } from "@/components/app-provider";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { aiErrorMessage, useSubjectAi } from "@/components/use-subject-ai";
import { requestClassify } from "@/lib/ai-client";
import { SCAN_LIMITS } from "@/lib/constants";
import { format } from "@/lib/i18n";
import { canvasToBase64Jpeg, canvasToBlob, fingerprintFiles, type ScanSource } from "@/lib/scan-source";
import { matchSubject } from "@/lib/skills-prompt";

/** A selection that has been validated and opened, waiting for the student to confirm its details. */
export interface UploadDraft {
  source: ScanSource;
  /** What will be stored: the PDF, the photos, or the rendered pages of a Word document. */
  files: File[];
  /** The selected file's own name. */
  name: string;
}

const stripExtension = (name: string) => name.replace(/\.(pdf|docx|png|jpe?g|webp|heic|heif)$/i, "");

export function UploadDialog({ draft, defaultSubjectId, onClose }: { draft: UploadDraft | null; defaultSubjectId: string | null; onClose: () => void }) {
  const { t } = useVault();
  return (
    <Modal open={draft !== null} onClose={onClose} title={t.sources.dialog.title} description={draft ? `${draft.name} · ${format(t.sources.pages, { n: draft.source.pageCount })}` : undefined}>
      {/* <Modal> mounts its children only while open, so the form starts fresh for every file. */}
      {draft && <UploadForm draft={draft} defaultSubjectId={defaultSubjectId} onClose={onClose} />}
    </Modal>
  );
}

function UploadForm({ draft, defaultSubjectId, onClose }: { draft: UploadDraft; defaultSubjectId: string | null; onClose: () => void }) {
  const { snapshot, t, actions } = useVault();
  const router = useRouter();
  const id = React.useId();
  const subjects = snapshot.subjects.filter((s) => s.archivedAt === null);
  const [title, setTitle] = React.useState(stripExtension(draft.name));
  const [subjectId, setSubjectId] = React.useState(subjects.find((s) => s.id === defaultSubjectId)?.id ?? subjects[0]?.id ?? "");
  const [suggestion, setSuggestion] = React.useState<string | null>(null);
  const [aiBusy, setAiBusy] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const ai = useSubjectAi(subjects.find((s) => s.id === subjectId) ?? null);
  const isWord = draft.name.toLowerCase().endsWith(".docx");

  React.useEffect(() => {
    const abort = abortRef;
    return () => abort.current?.abort();
  }, []);

  /** Feature "Tự động điền bằng AI": the first page goes to the student's own model; its answer fills the form. */
  async function autofill() {
    const controller = new AbortController();
    abortRef.current = controller;
    const call = ai.call(controller.signal);
    if (!call) return setError(t.ai.errors.NO_KEY);
    setAiBusy(true);
    setError(null);
    try {
      const page = await draft.source.renderPage(1, 1600);
      const result = await requestClassify(call, { image: { mimeType: "image/jpeg", data: canvasToBase64Jpeg(page) }, subjects: subjects.map((s) => s.name) });
      setTitle(result.title);
      const match = matchSubject(subjects, result.subject);
      if (match) {
        setSubjectId(match.id);
        setSuggestion(null);
      } else {
        setSuggestion(result.subject);
      }
    } catch (err) {
      if (!controller.signal.aborted) setError(aiErrorMessage(t, err));
    } finally {
      if (!controller.signal.aborted) setAiBusy(false);
    }
  }

  async function createSuggested() {
    if (!suggestion) return;
    try {
      const created = await actions.createSubject({ name: suggestion });
      setSubjectId(created.id);
      setSuggestion(null);
    } catch {
      setError(t.common.errorGeneric);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!subjectId) return setError(t.problem.errors.noSubject);
    setUploading(true);
    setError(null);
    try {
      const { source, files } = draft;
      const thumbnail = await canvasToBlob(await source.renderPage(1, SCAN_LIMITS.thumbnailLongEdge), "image/jpeg", 0.8).catch(() => null);
      const created = await actions.createSource({
        title: title.trim() || stripExtension(draft.name),
        subjectId,
        fileKind: source.kind,
        mimeType: files[0].type || (source.kind === "PDF" ? "application/pdf" : "image/jpeg"),
        fileSizeBytes: files.reduce((sum, f) => sum + f.size, 0),
        pageCount: source.pageCount,
        sha256: await fingerprintFiles(files),
        files,
        thumbnail,
      });
      onClose();
      router.push(`/sources/${created.id}`);
    } catch {
      setError(t.common.errorGeneric);
      setUploading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2.5">
        <p className="min-w-0 text-caption text-muted-foreground">{ai.key ? t.sources.dialog.autoFillHint : t.ai.noKey}</p>
        <Button type="button" variant="outline" size="sm" disabled={!ai.key || aiBusy || uploading} onClick={() => void autofill()} className="shrink-0">
          {aiBusy && <Loader2 className="animate-spin" />}
          {aiBusy ? t.sources.dialog.autoFilling : t.sources.dialog.autoFill}
        </Button>
      </div>

      <Field label={t.sources.titleLabel} htmlFor={`${id}-title`}>
        <Input id={`${id}-title`} data-autofocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      </Field>
      <Field label={t.problem.subject} htmlFor={`${id}-subject`}>
        <Select id={`${id}-subject`} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      {suggestion && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground" role="status">
          {format(t.sources.dialog.suggested, { name: suggestion })}
          <button type="button" onClick={() => void createSuggested()} className="font-medium text-brand hover:underline">
            {t.sources.dialog.createSubject}
          </button>
        </p>
      )}
      {isWord && <p className="text-caption text-subtle">{t.sources.dialog.wordNote}</p>}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="lg" onClick={onClose} disabled={uploading}>
          {t.common.cancel}
        </Button>
        <Button type="submit" size="lg" disabled={uploading || aiBusy || subjects.length === 0}>
          {uploading ? t.sources.dialog.submitting : t.sources.dialog.submit}
        </Button>
      </div>
    </form>
  );
}
