"use client";

import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import * as React from "react";

import { useVault } from "@/components/app-provider";
import { MemoryPanel } from "@/components/brain/memory-panel";
import { SubjectTagsPanel } from "@/components/brain/subject-tags-panel";
import { CrosshairCard } from "@/components/crosshair-card";
import { Modal } from "@/components/modal";
import { SubjectDialog } from "@/components/subject-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { swatchColor } from "@/lib/constants";
import { format } from "@/lib/i18n";
import { startOfDay, timezoneOffsetMinutes } from "@/lib/stats";
import type { Topic } from "@/lib/repo/types";

/** Add / rename form: a single text input with confirm + cancel. */
function InlineNameForm({ initial = "", placeholder, label, onSubmit, onCancel }: { initial?: string; placeholder: string; label: string; onSubmit: (name: string) => Promise<void>; onCancel: () => void }) {
  const { t } = useVault();
  const [value, setValue] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!value.trim() || busy) return;
        setBusy(true);
        try {
          await onSubmit(value.trim());
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} aria-label={label} maxLength={80} onKeyDown={(e) => e.key === "Escape" && onCancel()} className="h-8" />
      <Button type="submit" size="icon" disabled={!value.trim() || busy} aria-label={t.common.save}><Check /></Button>
      <Button type="button" size="icon" variant="ghost" onClick={onCancel} aria-label={t.common.cancel}><X /></Button>
    </form>
  );
}

function TopicRow({ topic, count, isChapter, children }: { topic: Topic; count: number; isChapter: boolean; children?: React.ReactNode }) {
  const { t, actions } = useVault();
  const [renaming, setRenaming] = React.useState(false);
  const [adding, setAdding] = React.useState(false);

  return (
    <li className="space-y-2">
      <div className="group flex items-center gap-2 rounded-md border border-border px-3 py-2">
        {!isChapter && <span className="ml-1 size-1.5 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden />}
        {renaming ? (
          <div className="flex-1">
            <InlineNameForm initial={topic.name} label={t.topics.rename} placeholder={t.topics.rename} onCancel={() => setRenaming(false)} onSubmit={async (name) => { await actions.renameTopic(topic.id, name); setRenaming(false); }} />
          </div>
        ) : (
          <>
            <span className={isChapter ? "flex-1 truncate text-sm font-medium" : "flex-1 truncate text-sm"}>{topic.name}</span>
            <span className="tabular-nums text-xs text-muted-foreground">{format(t.topics.cardsIn, { n: count })}</span>
            <div className="flex gap-0.5 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
              {isChapter && <Button variant="ghost" size="icon-sm" onClick={() => setAdding(true)} aria-label={`${t.topics.addTopic}: ${topic.name}`}><Plus /></Button>}
              <Button variant="ghost" size="icon-sm" onClick={() => setRenaming(true)} aria-label={`${t.topics.rename}: ${topic.name}`}><Pencil /></Button>
              <Button variant="ghost" size="icon-sm" onClick={() => { if (!isChapter || window.confirm(t.topics.deleteChapterConfirm)) void actions.deleteTopic(topic.id); }} aria-label={`${t.common.delete}: ${topic.name}`}><Trash2 /></Button>
            </div>
          </>
        )}
      </div>
      {(children || adding) && (
        <ul className="ml-5 space-y-2 border-l border-border pl-3">
          {children}
          {adding && (
            <li>
              <InlineNameForm label={t.topics.addTopic} placeholder={t.topics.topicPlaceholder} onCancel={() => setAdding(false)} onSubmit={async (name) => { await actions.createTopic({ subjectId: topic.subjectId, parentId: topic.id, name }); setAdding(false); }} />
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

export function SubjectsWorkspace() {
  const { snapshot, activeSubjectId, actions, t, loadedAt, user } = useVault();
  const [editing, setEditing] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [addingChapter, setAddingChapter] = React.useState(false);

  const subjects = snapshot.subjects.filter((s) => s.archivedAt === null);
  const subject = subjects.find((s) => s.id === activeSubjectId) ?? null;
  const offset = timezoneOffsetMinutes(user.timezone, loadedAt);

  const topics = snapshot.topics.filter((tp) => tp.subjectId === subject?.id);
  const chapters = topics.filter((tp) => tp.parentId === null);
  const cardCounts = new Map<string, number>();
  for (const c of snapshot.cards) if (c.topicId && c.archivedAt === null) cardCounts.set(c.topicId, (cardCounts.get(c.topicId) ?? 0) + 1);
  const chapterCount = (chapter: Topic) => topics.filter((tp) => tp.parentId === chapter.id).reduce((n, tp) => n + (cardCounts.get(tp.id) ?? 0), cardCounts.get(chapter.id) ?? 0);

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1.5">
        <h1 className="text-display">{t.subjects.title}</h1>
        <p className="max-w-xl text-muted-foreground">{t.subjects.subtitle}</p>
      </div>
      <Button size="lg" onClick={() => setCreating(true)}>{t.subjects.add}</Button>
    </div>
  );

  if (!subject) {
    return (
      <div className="space-y-6">
        {header}
        {subjects.length === 0 ? (
          <CrosshairCard className="space-y-2 py-14 text-center">
            <p className="text-title">{t.subjects.empty}</p>
            <p className="text-sm text-muted-foreground">{t.subjects.emptyBody}</p>
          </CrosshairCard>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t.subjects.selectPrompt}</p>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {subjects.map((s) => {
                const own = snapshot.topics.filter((tp) => tp.subjectId === s.id);
                return (
                  <li key={s.id}>
                    <button type="button" onClick={() => actions.setActiveSubject(s.id)} className="block w-full text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                      <CrosshairCard className="space-y-2 p-5 transition-colors hover:border-primary/50">
                        <div className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ backgroundColor: swatchColor(s.color) ?? "var(--subtle-foreground)" }} aria-hidden /><h2 className="text-sm font-semibold">{s.name}</h2></div>
                        {s.description && <p className="line-clamp-2 text-xs text-muted-foreground">{s.description}</p>}
                        <p className="tabular-nums text-xs text-muted-foreground">{format(t.topics.count, { c: own.filter((tp) => !tp.parentId).length, t: own.filter((tp) => tp.parentId).length })}</p>
                      </CrosshairCard>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <SubjectDialog open={creating} onClose={() => setCreating(false)} />
      </div>
    );
  }

  const daysToExam = subject.examDate ? Math.ceil((subject.examDate.getTime() - startOfDay(loadedAt, offset).getTime()) / 86_400_000) : null;

  return (
    <div className="space-y-6">
      {header}
      <CrosshairCard glow className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: swatchColor(subject.color) ?? "var(--subtle-foreground)" }} aria-hidden />
              <h2 className="truncate text-title">{subject.name}</h2>
            </div>
            {subject.description && <p className="max-w-2xl text-sm text-muted-foreground">{subject.description}</p>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="lg" onClick={() => setEditing(true)}>{t.common.edit}</Button>
            <Button variant="destructive" size="lg" onClick={() => setDeleting(true)}>{t.common.delete}</Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{t.subjects.aiLanguage}: {subject.aiOutputLanguage ? t.language[subject.aiOutputLanguage] : t.subjects.followDefault}</Badge>
          {daysToExam !== null && <Badge variant="secondary" className="tabular-nums">{daysToExam >= 0 ? format(t.subjects.examIn, { n: daysToExam }) : t.subjects.examPassed}</Badge>}
          <Badge variant={subject.memoryStale ? "outline" : "secondary"}>{subject.memoryStale ? t.subjects.memoryStale : t.subjects.memoryFresh}</Badge>
        </div>
      </CrosshairCard>

      <MemoryPanel key={`memory-${subject.id}`} subject={subject} />
      <SubjectTagsPanel key={`tags-${subject.id}`} subject={subject} />

      <CrosshairCard className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-heading">{t.topics.title}</h2>
            <p className="text-xs text-muted-foreground">{t.topics.subtitle} <span className="tabular-nums">· {format(t.topics.count, { c: chapters.length, t: topics.length - chapters.length })}</span></p>
          </div>
          {!addingChapter && <Button variant="outline" size="lg" onClick={() => setAddingChapter(true)}>{t.topics.addChapter}</Button>}
        </div>
        {addingChapter && <InlineNameForm label={t.topics.addChapter} placeholder={t.topics.chapterPlaceholder} onCancel={() => setAddingChapter(false)} onSubmit={async (name) => { await actions.createTopic({ subjectId: subject.id, name }); setAddingChapter(false); }} />}
        {chapters.length === 0 && !addingChapter ? (
          <div className="space-y-1 py-8 text-center">
            <p className="text-sm font-medium">{t.topics.empty}</p>
            <p className="text-xs text-muted-foreground">{t.topics.emptyBody}</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {chapters.map((chapter) => (
              <TopicRow key={chapter.id} topic={chapter} isChapter count={chapterCount(chapter)}>
                {topics.filter((tp) => tp.parentId === chapter.id).map((tp) => <TopicRow key={tp.id} topic={tp} isChapter={false} count={cardCounts.get(tp.id) ?? 0} />)}
              </TopicRow>
            ))}
          </ul>
        )}
      </CrosshairCard>

      <SubjectDialog open={creating} onClose={() => setCreating(false)} />
      <SubjectDialog open={editing} onClose={() => setEditing(false)} subject={subject} />
      <Modal open={deleting} onClose={() => setDeleting(false)} title={t.subjects.deleteTitle} description={t.subjects.deleteBody}>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="lg" onClick={() => setDeleting(false)}>{t.common.cancel}</Button>
          <Button variant="destructive" size="lg" onClick={() => { setDeleting(false); void actions.deleteSubject(subject.id); }}>{t.common.confirmDelete}</Button>
        </div>
      </Modal>
    </div>
  );
}
