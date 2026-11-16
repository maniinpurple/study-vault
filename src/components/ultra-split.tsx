"use client";

import Link from "next/link";
import * as React from "react";

import { useVault } from "@/components/app-provider";
import { cn } from "@/lib/utils";

/** What the subject column counts next to each name. */
export type SplitKind = "sources" | "vault";

/**
 * Ultra-minimal's left column on /sources and /vault: the SUBJECTS heading, a bottom-lined filter field, and one plain text row per
 * subject (name left, count right). It is the global subject filter, exactly like the sidebar's list. Hidden in Standard mode.
 */
function SubjectColumn({ kind }: { kind: SplitKind }) {
  const { snapshot, t, activeSubjectId, actions } = useVault();
  const [query, setQuery] = React.useState("");
  const subjects = snapshot.subjects.filter((s) => s.archivedAt === null);
  const countOf = (subjectId: string | null) =>
    kind === "sources"
      ? snapshot.examUploads.filter((u) => subjectId === null || u.subjectId === subjectId).length
      : snapshot.cards.filter((c) => c.archivedAt === null && (subjectId === null || c.subjectId === subjectId)).length;
  const needle = query.trim().toLowerCase();
  const shown = subjects.filter((s) => !needle || s.name.toLowerCase().includes(needle));
  const row = (active: boolean) => cn("flex w-full items-baseline justify-between gap-3 py-1.5 text-left text-sm transition-colors", active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground");

  return (
    <aside className="vl-ultra-only w-48 shrink-0 space-y-4" aria-label={t.ultra.subjects}>
      <h2 className="text-[11px] tracking-wider text-muted-foreground uppercase">{t.ultra.subjects}</h2>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t.ultra.filterSubjects}
        aria-label={t.ultra.filterSubjects}
        className="block w-full border-0 border-b border-border bg-transparent px-0 py-1.5 text-sm placeholder:text-subtle focus-visible:border-foreground"
      />
      <ul className="space-y-0.5">
        {!needle && (
          <li>
            <button type="button" aria-pressed={activeSubjectId === null} onClick={() => actions.setActiveSubject(null)} className={row(activeSubjectId === null)}>
              <span className="truncate">{t.nav.allSubjects}</span>
              <span className="text-caption tabular-nums">{countOf(null)}</span>
            </button>
          </li>
        )}
        {shown.map((subject) => (
          <li key={subject.id}>
            <button type="button" aria-pressed={subject.id === activeSubjectId} onClick={() => actions.setActiveSubject(subject.id)} className={row(subject.id === activeSubjectId)}>
              <span className="truncate">{subject.name}</span>
              <span className="text-caption tabular-nums">{countOf(subject.id)}</span>
            </button>
          </li>
        ))}
        {needle && shown.length === 0 && <li className="py-1.5 text-caption text-subtle">{t.ultra.noSubjects}</li>}
      </ul>
      <Link href="/subjects" className="inline-block text-caption text-muted-foreground hover:text-foreground">
        {t.nav.manageSubjects}
      </Link>
    </aside>
  );
}

/** A page body with the subject column beside it in Ultra-minimal; in Standard mode the column is hidden and the body is as it was. */
export function UltraSplit({ kind, children }: { kind: SplitKind; children: React.ReactNode }) {
  return (
    <div className="vl-split">
      <SubjectColumn kind={kind} />
      <div className="min-w-0 flex-1 space-y-6">{children}</div>
    </div>
  );
}
