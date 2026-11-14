"use client";

import { LayoutGroup, motion } from "framer-motion";
import { Flag, ImagePlus, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { useVault } from "@/components/app-provider";
import { MathText } from "@/components/math-text";
import { Modal } from "@/components/modal";
import { AutosaveField, ProblemFields } from "@/components/problems/problem-fields";
import { StoredImage } from "@/components/stored-image";
import { Button } from "@/components/ui/button";
import { Field, Select, Textarea } from "@/components/ui/field";
import { useObjectUrl } from "@/components/use-object-url";
import { swatchColor } from "@/lib/constants";
import { format } from "@/lib/i18n";
import { topicPath } from "@/lib/lab";
import { spring } from "@/lib/motion";
import { problemSaveIssue, REVIEW_STATUSES, reviewStatus, type ReviewStatus } from "@/lib/problems";
import type { MistakeCard } from "@/lib/repo/types";
import { groupTopics } from "@/lib/scan-session";
import { timezoneOffsetMinutes } from "@/lib/stats";
import { tagDisplayName } from "@/lib/tags";
import { cn } from "@/lib/utils";
import { filterProblems, groupProblems, sortProblems, VAULT_GROUPS, VAULT_SORTS, type TimeBucket, type VaultGroup, type VaultSort } from "@/lib/vault";

const STATUS_DOT: Record<ReviewStatus, string> = { due: "bg-destructive", new: "bg-brand", learning: "bg-warning", scheduled: "bg-subtle", mastered: "bg-success" };

export function VaultView() {
  const { snapshot, user, t, loadedAt, activeSubjectId } = useVault();
  const [query, setQuery] = React.useState("");
  const [group, setGroup] = React.useState<VaultGroup>("time");
  const [sort, setSort] = React.useState<VaultSort>("newest");
  const [status, setStatus] = React.useState<ReviewStatus | null>(null);
  const [priorityOnly, setPriorityOnly] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);

  const subjects = snapshot.subjects.filter((s) => s.archivedAt === null);
  const scope = subjects.find((s) => s.id === activeSubjectId) ?? null;
  const ctx = { now: loadedAt, utcOffsetMinutes: timezoneOffsetMinutes(user.timezone, loadedAt), cardTags: snapshot.cardTags };
  const total = snapshot.cards.filter((c) => c.archivedAt === null && (!scope || c.subjectId === scope.id)).length;
  const visible = sortProblems(filterProblems(snapshot.cards, { subjectId: scope?.id ?? null, query, priorityOnly, status }, ctx), sort);
  const order = group === "topic" ? snapshot.topics.map((x) => x.id) : group === "source" ? snapshot.examUploads.map((x) => x.id) : group === "tag" ? snapshot.tags.map((x) => x.id) : [];
  const sections = groupProblems(visible, group, ctx, order);
  const filtered = query.trim() !== "" || status !== null || priorityOnly;
  const editing = editingId ? (snapshot.cards.find((c) => c.id === editingId) ?? null) : null;

  function sectionLabel(key: string | null): string {
    if (group === "time") return t.vault.time[key as TimeBucket];
    if (group === "status") return t.problem.status[key as ReviewStatus];
    if (group === "topic") return topicPath(key, snapshot.topics) ?? t.vault.noTopic;
    if (group === "source") return snapshot.examUploads.find((u) => u.id === key)?.title ?? t.vault.noSource;
    const tag = snapshot.tags.find((x) => x.id === key);
    return tag ? tagDisplayName(t, tag) : t.vault.noTag;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-display">{t.vault.title}</h1>
          <p className="max-w-xl text-muted-foreground">{t.vault.subtitle}</p>
        </div>
        <Button size="lg" onClick={() => setAdding(true)}>
          <Plus />
          {t.vault.add}
        </Button>
      </header>

      {/* Controls: sticky, so grouping and filters stay at hand while scrolling the grid. */}
      <div className="sticky top-12 z-20 -mx-4 space-y-3 border-b border-border bg-background/92 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-52 flex-1">
            <span className="sr-only">{t.vault.search}</span>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.vault.search} className="h-8 w-full rounded-md bg-muted pr-3 pl-8 text-sm placeholder:text-subtle hover:bg-secondary focus-visible:bg-secondary" />
          </label>
          <Select aria-label={t.vault.sortBy} value={sort} onChange={(e) => setSort(e.target.value as VaultSort)} className="h-8 w-auto text-[13px]">
            {VAULT_SORTS.map((s) => (
              <option key={s} value={s}>
                {t.vault.sort[s]}
              </option>
            ))}
          </Select>
          <Select aria-label={t.vault.filterStatus} value={status ?? ""} onChange={(e) => setStatus((e.target.value || null) as ReviewStatus | null)} className="h-8 w-auto text-[13px]">
            <option value="">{t.vault.anyStatus}</option>
            {REVIEW_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t.problem.status[s]}
              </option>
            ))}
          </Select>
          <button
            type="button"
            aria-pressed={priorityOnly}
            onClick={() => setPriorityOnly((v) => !v)}
            className={cn("flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[13px] transition-colors", priorityOnly ? "border-transparent bg-mark-soft font-medium text-mark-foreground" : "border-border text-muted-foreground hover:text-foreground")}
          >
            <Flag className="size-3.5" aria-hidden />
            {t.vault.priorityOnly}
          </button>
          {filtered && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setQuery("");
                setStatus(null);
                setPriorityOnly(false);
              }}
            >
              <X />
              {t.vault.clearFilters}
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-caption text-subtle">{t.vault.groupBy}</span>
            <LayoutGroup id="vault-group">
              <div role="radiogroup" aria-label={t.vault.groupBy} className="flex rounded-lg bg-muted p-0.5">
                {VAULT_GROUPS.map((g) => (
                  <button key={g} type="button" role="radio" aria-checked={group === g} onClick={() => setGroup(g)} className={cn("relative h-7 rounded-md px-2.5 text-[13px] transition-colors", group === g ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
                    {group === g && <motion.span layoutId="thumb" transition={spring.snappy} className="absolute inset-0 rounded-md bg-card shadow-xs" aria-hidden />}
                    <span className="relative">{t.vault.group[g]}</span>
                  </button>
                ))}
              </div>
            </LayoutGroup>
          </div>
          <p className="text-caption text-subtle tabular-nums" aria-live="polite">
            {filtered ? `${visible.length} / ` : ""}
            {format(t.vault.count, { n: total })}
          </p>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="space-y-1.5 rounded-xl border border-dashed border-border-strong px-6 py-16 text-center">
          <p className="text-title">{total === 0 ? t.vault.empty : t.vault.emptyFiltered}</p>
          <p className="text-muted-foreground">{total === 0 ? t.vault.emptyBody : t.vault.emptyFilteredBody}</p>
        </div>
      ) : (
        <div className="space-y-10">
          {sections.map((section) => (
            <section key={section.key ?? "none"} aria-label={sectionLabel(section.key)} className="space-y-4">
              <div className="flex items-center gap-3">
                <h2 className="text-overline">{sectionLabel(section.key)}</h2>
                <span className="text-caption text-subtle tabular-nums">{section.cards.length}</span>
                <span className="h-px flex-1 bg-border" aria-hidden />
              </div>
              <ul className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
                {section.cards.map((card) => (
                  <li key={card.id}>
                    <VaultCard card={card} status={reviewStatus(card, ctx.now, ctx.utcOffsetMinutes)} onEdit={() => setEditingId(card.id)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Modal open={editing !== null} onClose={() => setEditingId(null)} title={t.vault.editTitle} className="w-[min(44rem,calc(100vw-2rem))]">
        {editing && <ProblemEditor key={editing.id} card={editing} onClose={() => setEditingId(null)} />}
      </Modal>
      <Modal open={adding} onClose={() => setAdding(false)} title={t.vault.newTitle} description={t.vault.newBody} className="w-[min(40rem,calc(100vw-2rem))]">
        <NewProblemForm defaultSubjectId={scope?.id ?? subjects[0]?.id ?? null} onClose={() => setAdding(false)} />
      </Modal>
    </div>
  );
}

/** One problem: the question (image or formatted text), then its solution and takeaway, always together. */
function VaultCard({ card, status, onEdit }: { card: MistakeCard; status: ReviewStatus; onEdit: () => void }) {
  const { snapshot, t } = useVault();
  const subject = snapshot.subjects.find((s) => s.id === card.subjectId);
  const source = card.examUploadId ? snapshot.examUploads.find((u) => u.id === card.examUploadId) : null;
  const tagIds = new Set(snapshot.cardTags.filter((l) => l.cardId === card.id).map((l) => l.tagId));
  const tags = snapshot.tags.filter((tag) => tagIds.has(tag.id));
  const hasText = card.questionLatex.trim().length > 0;

  return (
    <article className="group overflow-hidden rounded-lg border border-border bg-card shadow-xs transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-px hover:shadow-md">
      <header className="flex items-center gap-2 py-1.5 pr-1.5 pl-3.5 text-caption text-muted-foreground">
        <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: swatchColor(subject?.color) ?? "var(--subtle-foreground)" }} aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          {subject?.name}
          {source && ` · ${source.title}`}
          {card.sourcePage !== null && source && ` · ${format(t.problem.pageShort, { n: card.sourcePage })}`}
        </span>
        {card.isHighYield && <span className="shrink-0 rounded-full bg-mark-soft px-2 py-0.5 font-medium text-mark-foreground">{t.problem.priority}</span>}
        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={t.common.edit} title={t.common.edit}>
          <Pencil />
        </Button>
      </header>

      <div className="border-y border-border">
        {hasText ? (
          <MathText text={card.questionLatex} className="max-h-72 overflow-y-auto p-3.5 text-reading" />
        ) : (
          <div className="bg-white">
            <StoredImage path={card.originalCropPath} alt={t.problem.imageAlt} className="mx-auto block max-h-72 w-auto max-w-full" />
          </div>
        )}
        {hasText && card.diagramImagePath && (
          <div className="border-t border-border bg-white">
            <StoredImage path={card.diagramImagePath} alt={t.review.figure} className="mx-auto block max-h-56 w-auto max-w-full" />
          </div>
        )}
      </div>

      <div className="space-y-3 p-3.5">
        <div className="space-y-1">
          <h3 className="text-caption font-medium text-muted-foreground">{t.problem.solution}</h3>
          {card.correctAnswerLatex && <MathText text={card.correctAnswerLatex} className="text-reading" />}
          {card.solutionLatex ? <MathText text={card.solutionLatex} className="text-reading" /> : !card.correctAnswerLatex && <p className="text-sm text-subtle">{t.vault.noSolution}</p>}
        </div>
        {card.ahaNote && (
          <div className="space-y-1 border-l-2 border-mark pl-3">
            <h3 className="text-caption font-medium text-muted-foreground">{t.problem.takeaway}</h3>
            <MathText text={card.ahaNote} className="text-sm" />
          </div>
        )}
        <footer className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-caption text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} aria-hidden />
            {t.problem.status[status]}
          </span>
          {card.attemptCount > 0 && <span className="tabular-nums">{format(t.problem.attempts, { n: card.attemptCount })}</span>}
          {tags.map((tag) => (
            <span key={tag.id} className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: swatchColor(tag.color) ?? "var(--subtle-foreground)" }} aria-hidden />
              {tagDisplayName(t, tag)}
            </span>
          ))}
        </footer>
      </div>
    </article>
  );
}

/** Edit dialog: every field saves itself; the question keeps its image and its text side by side. */
function ProblemEditor({ card, onClose }: { card: MistakeCard; onClose: () => void }) {
  const { snapshot, t, actions } = useVault();
  const [confirming, setConfirming] = React.useState(false);
  const groups = groupTopics(snapshot.topics, card.subjectId);

  return (
    <div className="space-y-4">
      {card.originalCropPath && (
        <div className="overflow-hidden rounded-md border border-border bg-white">
          <StoredImage path={card.originalCropPath} alt={t.problem.imageAlt} className="mx-auto block max-h-80 w-auto max-w-full" />
        </div>
      )}
      <AutosaveField label={t.problem.question} value={card.questionLatex} placeholder={t.problem.questionPlaceholder} rows={3} mono onSave={(text) => actions.updateCard(card.id, { questionLatex: text })} />
      {card.questionLatex.trim() && <MathText text={card.questionLatex} className="rounded-md border border-border p-3 text-reading" />}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t.problem.topic} htmlFor="edit-topic">
          <Select id="edit-topic" value={card.topicId ?? ""} onChange={(e) => void actions.updateCard(card.id, { topicId: e.target.value || null })}>
            <option value="">{t.problem.noTopic}</option>
            {groups.map(({ chapter, children }) =>
              children.length === 0 ? (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.name}
                </option>
              ) : (
                <optgroup key={chapter.id} label={chapter.name}>
                  {children.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {topic.name}
                    </option>
                  ))}
                </optgroup>
              ),
            )}
          </Select>
        </Field>
        <div className="space-y-1.5">
          <p className="text-xs font-medium">{t.problem.priority}</p>
          <Button variant="outline" aria-pressed={card.isHighYield} onClick={() => void actions.updateCard(card.id, { isHighYield: !card.isHighYield })} className={cn("h-9 w-full justify-start", card.isHighYield && "border-transparent bg-mark-soft text-mark-foreground hover:bg-mark-soft")}>
            <Flag />
            {card.isHighYield ? t.problem.unmarkPriority : t.problem.markPriority}
          </Button>
        </div>
      </div>

      <ProblemFields card={card} />

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {confirming ? (
          <>
            <p className="min-w-0 flex-1 text-sm text-muted-foreground">{t.problem.deleteBody}</p>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                onClose();
                void actions.deleteProblem(card.id);
              }}
            >
              {t.common.confirmDelete}
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" className="text-destructive" onClick={() => setConfirming(true)}>
              <Trash2 />
              {t.problem.delete}
            </Button>
            {card.examUploadId && (
              <Link href={`/sources/${card.examUploadId}`} className="rounded-md px-2 py-1 text-sm text-brand hover:underline">
                {t.problem.openSource}
              </Link>
            )}
            <Button className="ml-auto" onClick={onClose}>
              {t.common.done}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/** Add a standalone problem: text and/or an image, plus optional solution and takeaway. */
function NewProblemForm({ defaultSubjectId, onClose }: { defaultSubjectId: string | null; onClose: () => void }) {
  const { snapshot, t, actions } = useVault();
  const id = React.useId();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const subjects = snapshot.subjects.filter((s) => s.archivedAt === null);
  const [subjectId, setSubjectId] = React.useState(defaultSubjectId ?? "");
  const [question, setQuestion] = React.useState("");
  const [solution, setSolution] = React.useState("");
  const [takeaway, setTakeaway] = React.useState("");
  const [image, setImage] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const imageUrl = useObjectUrl(image);

  if (subjects.length === 0) return <p className="text-sm text-muted-foreground">{t.vault.needSubject}</p>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const issue = problemSaveIssue({ questionLatex: question, hasImage: image !== null, subjectId: subjectId || null });
    if (issue) return setError(issue === "NO_SUBJECT" ? t.problem.errors.noSubject : t.problem.errors.empty);
    setBusy(true);
    setError(null);
    try {
      await actions.createProblem({ subjectId, questionLatex: question, solutionLatex: solution, ahaNote: takeaway, originalCrop: image });
      onClose();
    } catch {
      setError(t.problem.errors.saveFailed);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label={t.problem.subject} htmlFor={`${id}-subject`}>
        <Select id={`${id}-subject`} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t.problem.question} htmlFor={`${id}-question`}>
        <Textarea id={`${id}-question`} data-autofocus value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t.problem.questionPlaceholder} rows={4} spellCheck={false} className="font-mono text-[13px]" />
      </Field>
      {question.trim() && <MathText text={question} className="rounded-md border border-border p-3 text-reading" />}

      {imageUrl ? (
        <div className="space-y-2">
          <div className="overflow-hidden rounded-md border border-border bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob: URL */}
            <img src={imageUrl} alt={t.problem.imageAlt} className="mx-auto block max-h-64 w-auto max-w-full" />
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setImage(null)}>
            <X />
            {t.vault.removeImage}
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
          <ImagePlus />
          {t.vault.attach}
        </Button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-label={t.vault.attach}
        onChange={(e) => {
          setImage(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />

      <Field label={`${t.problem.solution} · ${t.common.optional}`} htmlFor={`${id}-solution`}>
        <Textarea id={`${id}-solution`} value={solution} onChange={(e) => setSolution(e.target.value)} placeholder={t.problem.solutionPlaceholder} rows={3} />
      </Field>
      <Field label={`${t.problem.takeaway} · ${t.common.optional}`} htmlFor={`${id}-takeaway`}>
        <Textarea id={`${id}-takeaway`} value={takeaway} onChange={(e) => setTakeaway(e.target.value)} placeholder={t.problem.takeawayPlaceholder} rows={2} />
      </Field>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="lg" onClick={onClose}>
          {t.common.cancel}
        </Button>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? t.common.saving : t.vault.create}
        </Button>
      </div>
    </form>
  );
}
