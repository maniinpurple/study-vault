"use client";

import Link from "next/link";
import * as React from "react";

import { useActions, useI18n } from "@/components/app-provider";
import { deadlineState, type SourceSort } from "@/lib/homework";
import { format } from "@/lib/i18n";
import type { ExamUpload } from "@/lib/repo/types";
import { cn } from "@/lib/utils";

const COLUMNS = "grid-cols-[minmax(0,2.4fr)_minmax(0,1.2fr)_8.5rem_6.5rem_3rem]";

export interface SourcesTableProps {
  sources: readonly ExamUpload[];
  subjectName: (source: ExamUpload) => string | null;
  snipCount: (source: ExamUpload) => number;
  today: string;
  sort: SourceSort;
  onSort: (sort: SourceSort) => void;
  onDelete: (source: ExamUpload) => void;
}

/** One hairline row: file name, topic (subject), due date and status, the last two editable in place. */
const Row = React.memo(function Row({ source, subject, snips, today, onDelete }: { source: ExamUpload; subject: string | null; snips: number; today: string; onDelete: (source: ExamUpload) => void }) {
  const { t } = useI18n();
  const actions = useActions();
  const state = deadlineState(source, today);
  const tone = state.kind === "overdue" ? "text-destructive" : state.kind === "today" || (state.kind === "upcoming" && state.soon) ? "text-warning" : "text-muted-foreground";
  const dueText = state.kind === "overdue" ? format(t.homework.overdue, { n: state.days }) : state.kind === "today" ? t.homework.dueToday : state.kind === "upcoming" ? format(t.homework.dueIn, { n: state.days }) : undefined;

  return (
    <li className={cn("group grid items-center gap-x-4 border-b border-border py-3.5", COLUMNS, source.completed && "opacity-70")}>
      <span className="min-w-0">
        <Link href={`/sources/${source.id}`} className="block truncate text-sm font-medium hover:underline hover:underline-offset-4" title={source.title}>
          {source.title}
        </Link>
        {snips > 0 && <span className="block text-caption text-subtle tabular-nums">{format(t.sources.snips, { n: snips })}</span>}
      </span>
      <span className="truncate text-sm text-muted-foreground">{subject ?? "–"}</span>
      <span className="min-w-0">
        <label className="sr-only" htmlFor={`due-${source.id}`}>
          {t.homework.deadline}
        </label>
        <input
          id={`due-${source.id}`}
          type="date"
          value={source.deadline ?? ""}
          title={dueText ?? (source.deadline ? t.homework.deadline : t.ultra.noDue)}
          onChange={(e) => void actions.updateSource(source.id, { deadline: e.target.value || null }).catch(() => undefined)}
          className={cn("block h-7 w-full min-w-0 border-0 bg-transparent p-0 text-sm tabular-nums", tone, !source.deadline && "text-subtle")}
        />
      </span>
      <button
        type="button"
        aria-pressed={source.completed}
        aria-label={format(t.homework.markDone, { title: source.title })}
        onClick={() => void actions.updateSource(source.id, { completed: !source.completed }).catch(() => undefined)}
        className={cn("text-left text-sm hover:underline hover:underline-offset-4", source.completed ? "text-success" : "text-muted-foreground")}
      >
        {source.completed ? t.homework.done : t.homework.todo}
      </button>
      <button
        type="button"
        onClick={() => onDelete(source)}
        aria-label={`${t.sources.delete}: ${source.title}`}
        className="text-right text-caption text-subtle opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-destructive max-md:opacity-100"
      >
        {t.ultra.delete}
      </button>
    </li>
  );
});

/**
 * Ultra-minimal's Sources list: hairline rows and, under them, the column headers, which sort the list. The columns map to the
 * homework tracker: file name, topic (the subject), due date (`deadline`) and status (`completed`).
 */
export function SourcesTable({ sources, subjectName, snipCount, today, sort, onSort, onDelete }: SourcesTableProps) {
  const { t } = useI18n();
  const heads: { sort: SourceSort; label: string }[] = [
    { sort: "name", label: t.ultra.columns.fileName },
    { sort: "subject", label: t.ultra.columns.topic },
    { sort: "deadline", label: t.ultra.columns.dueDate },
    { sort: "status", label: t.ultra.columns.status },
  ];
  return (
    <div>
      <ul>
        {sources.map((source) => (
          <Row key={source.id} source={source} subject={subjectName(source)} snips={snipCount(source)} today={today} onDelete={onDelete} />
        ))}
      </ul>
      <div className={cn("grid items-center gap-x-4 py-3", COLUMNS)}>
        {heads.map((head) => (
          <button
            key={head.sort}
            type="button"
            aria-pressed={sort === head.sort}
            aria-label={format(t.ultra.sortBy, { column: head.label })}
            onClick={() => onSort(head.sort)}
            className={cn("flex items-center gap-1 text-left text-sm", sort === head.sort ? "font-semibold text-foreground" : "font-medium text-muted-foreground hover:text-foreground")}
          >
            {head.label}
            <span aria-hidden className="text-[10px]">
              ▾
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
