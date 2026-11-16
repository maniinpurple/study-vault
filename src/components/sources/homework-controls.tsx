"use client";

import * as React from "react";

import { useActions, useI18n } from "@/components/app-provider";
import { Input } from "@/components/ui/field";
import { deadlineState, type DeadlineState } from "@/lib/homework";
import { format, type Dictionary } from "@/lib/i18n";
import type { ExamUpload } from "@/lib/repo/types";
import { cn } from "@/lib/utils";

/** Text and tone for a source's standing against its due date. */
function describe(t: Dictionary, state: DeadlineState): { text: string; tone: "danger" | "warning" | "muted" } | null {
  switch (state.kind) {
    case "overdue":
      return { text: format(t.homework.overdue, { n: state.days }), tone: "danger" };
    case "today":
      return { text: t.homework.dueToday, tone: "warning" };
    case "upcoming":
      return { text: format(t.homework.dueIn, { n: state.days }), tone: state.soon ? "warning" : "muted" };
    default:
      return null;
  }
}

/**
 * Completion toggle, due date and standing of one source, editable in place (cards and rows both use it). Changes show at
 * once and are saved in the background (optimistic `updateSource`). Not a link: the library lays it over its stretched link.
 */
export const HomeworkControls = React.memo(function HomeworkControls({ source, today, className }: { source: ExamUpload; today: string; className?: string }) {
  const { t } = useI18n();
  const actions = useActions();
  const standing = describe(t, deadlineState(source, today));
  const id = React.useId();

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5", className)}>
      <label className={cn("flex cursor-pointer items-center gap-2 text-caption", source.completed ? "font-medium text-success" : "text-muted-foreground")}>
        <input
          type="checkbox"
          checked={source.completed}
          onChange={(e) => void actions.updateSource(source.id, { completed: e.target.checked }).catch(() => undefined)}
          aria-label={format(t.homework.markDone, { title: source.title })}
          className="size-4 accent-[var(--primary)]"
        />
        {source.completed ? t.homework.done : t.homework.todo}
      </label>
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className="sr-only">
          {t.homework.deadline}
        </label>
        <Input
          id={id}
          type="date"
          value={source.deadline ?? ""}
          title={source.deadline ? t.homework.deadline : t.homework.noDeadline}
          onChange={(e) => void actions.updateSource(source.id, { deadline: e.target.value || null }).catch(() => undefined)}
          className="h-8 w-auto min-w-0 px-2 text-caption"
        />
      </div>
      {standing && (
        <span
          className={cn("text-caption font-medium tabular-nums", standing.tone === "danger" && "text-destructive", standing.tone === "warning" && "text-warning", standing.tone === "muted" && "text-muted-foreground")}
        >
          {standing.text}
        </span>
      )}
    </div>
  );
});
