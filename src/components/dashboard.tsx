"use client";

import { motion } from "framer-motion";
import Link from "next/link";

import { useVault } from "@/components/app-provider";
import { buttonVariants } from "@/components/ui/button";
import { swatchColor } from "@/lib/constants";
import { format } from "@/lib/i18n";
import { spring, staggerDelay } from "@/lib/motion";
import { activityByDay, computeRetention, countDueToday, reviewStreak, subjectOverviews, timezoneOffsetMinutes } from "@/lib/stats";
import { cn } from "@/lib/utils";

const pct = (n: number) => `${Math.round(n * 100)}%`;

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="space-y-1 px-5 py-4">
      <dt className="text-caption text-muted-foreground">{label}</dt>
      <dd className="font-serif text-[2rem] leading-10 font-medium tabular-nums">{value}</dd>
      <dd className="text-caption text-subtle">{hint}</dd>
    </div>
  );
}

/** Overview: what is due today, how memory is holding up, and where each subject stands. */
export function Dashboard() {
  const { snapshot, user, t, locale, loadedAt, activeSubjectId, actions } = useVault();

  const offset = timezoneOffsetMinutes(user.timezone, loadedAt);
  const subjects = snapshot.subjects.filter((s) => s.archivedAt === null);
  const scope = subjects.find((s) => s.id === activeSubjectId) ?? null;
  const cards = (scope ? snapshot.cards.filter((c) => c.subjectId === scope.id) : snapshot.cards).filter((c) => !c.isSuspended && c.archivedAt === null);
  const cardIds = new Set(cards.map((c) => c.id));
  const logs = scope ? snapshot.logs.filter((l) => cardIds.has(l.cardId)) : snapshot.logs;

  const retention = computeRetention(logs, loadedAt, 30);
  const due = countDueToday(cards, loadedAt, offset);
  // A brand-new account (or an empty subject) has nothing to review yet: welcome it instead of saying it is "done".
  const isEmpty = cards.length === 0;
  const streak = reviewStreak(logs, loadedAt, offset);
  const activity = activityByDay(logs, loadedAt, offset, 14);
  const peak = Math.max(1, ...activity.map((d) => d.reviews));
  const overviews = subjectOverviews(subjects, snapshot.cards, snapshot.logs, loadedAt, offset);
  const activeKeys = snapshot.apiKeys.filter((k) => k.isActive).length;
  const today = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: user.timezone }).format(loadedAt);
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "numeric", timeZone: user.timezone });

  return (
    <div className="space-y-10">
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth} className="flex flex-wrap items-end justify-between gap-5">
        <div className="space-y-1.5">
          <p className="text-overline">
            {today}
            {scope && ` · ${scope.name}`}
          </p>
          <h1 className="text-display">{format(t.dashboard.greeting, { name: user.displayName ?? "" })}</h1>
          <p className="text-muted-foreground">{isEmpty ? t.dashboard.greetingNew : due > 0 ? format(t.dashboard.greetingSub, { n: due }) : t.dashboard.greetingNone}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/sources" className={buttonVariants({ variant: isEmpty ? "default" : "outline", size: "lg" })}>
            {t.dashboard.scan}
          </Link>
          {!isEmpty && (
            <Link href="/review" className={buttonVariants({ size: "lg" })}>
              {t.dashboard.review}
            </Link>
          )}
        </div>
      </motion.header>

      {isEmpty ? (
        <section aria-labelledby="overview-welcome" className="space-y-3 rounded-xl border border-dashed border-border-strong px-6 py-12 text-center">
          <h2 id="overview-welcome" className="text-title">
            {t.dashboard.welcomeTitle}
          </h2>
          <p className="mx-auto max-w-md text-muted-foreground">{t.dashboard.welcomeBody}</p>
          <Link href="/sources" className={buttonVariants({ size: "lg" })}>
            {t.dashboard.scan}
          </Link>
        </section>
      ) : (
        <>
        <dl aria-label={t.dashboard.title} className="grid divide-border overflow-hidden rounded-lg border border-border bg-card shadow-xs max-lg:divide-y sm:grid-cols-2 lg:grid-cols-4 lg:divide-x">
          <Stat label={t.dashboard.dueToday} value={String(due)} hint={t.dashboard.dueHint} />
          <Stat
            label={t.dashboard.retention}
            value={retention.rate === null ? "–" : pct(retention.rate)}
            hint={retention.rate === null ? t.dashboard.retentionEmpty : `${format(t.dashboard.retentionHint, { n: retention.reviews })} · ${format(t.dashboard.retentionTarget, { n: Math.round(user.desiredRetention * 100) })}`}
          />
          <Stat label={t.dashboard.totalCards} value={String(cards.length)} hint={format(t.dashboard.totalHint, { n: cards.filter((c) => c.isHighYield).length })} />
          <Stat label={t.dashboard.streak} value={String(streak)} hint={t.dashboard.streakHint} />
        </dl>

        <section aria-labelledby="overview-activity" className="space-y-4">
          <div className="flex items-baseline gap-3">
            <h2 id="overview-activity" className="text-overline">
              {t.dashboard.activity}
            </h2>
            <span className="text-caption text-subtle">{t.dashboard.activityHint}</span>
            <span className="h-px flex-1 self-center bg-border" aria-hidden />
          </div>
          <ul className="flex h-28 items-end gap-1.5">
            {activity.map((day, i) => (
              <li key={day.day.toISOString()} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${dayFmt.format(day.day)}: ${day.reviews}`}>
                <span className="text-[10px] text-subtle tabular-nums">{day.reviews || ""}</span>
                <span className={cn("w-full rounded-t-[3px]", i === activity.length - 1 ? "bg-brand" : day.reviews === 0 ? "bg-border" : "bg-border-strong")} style={{ height: `${Math.max(3, (day.reviews / peak) * 100)}%` }} />
              </li>
            ))}
          </ul>
        </section>
        </>
      )}

      <section aria-labelledby="overview-subjects" className="space-y-4">
        <div className="flex items-baseline gap-3">
          <h2 id="overview-subjects" className="text-overline">
            {t.dashboard.subjectOverview}
          </h2>
          <span className="h-px flex-1 self-center bg-border" aria-hidden />
          <Link href="/subjects" className="text-caption font-medium text-brand hover:underline">
            {t.dashboard.viewAll}
          </Link>
        </div>
        {overviews.length === 0 ? (
          <div className="space-y-1.5 rounded-xl border border-dashed border-border-strong px-6 py-12 text-center">
            <p className="text-title">{t.dashboard.noSubjects}</p>
            <p className="text-muted-foreground">{t.dashboard.noSubjectsBody}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-xs">
            {overviews.map(({ subject, totalCards, dueToday, mastered, retention: r }, i) => (
              <motion.li key={subject.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring.smooth, delay: staggerDelay(i) }}>
                <Link href="/subjects" onClick={() => actions.setActiveSubject(subject.id)} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 px-5 py-3.5 transition-colors hover:bg-muted sm:grid-cols-[minmax(0,1.4fr)_5rem_5rem_minmax(0,1fr)]">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: swatchColor(subject.color) ?? "var(--subtle-foreground)" }} aria-hidden />
                    <span className="truncate text-heading">{subject.name}</span>
                  </span>
                  <span className={cn("text-right text-sm tabular-nums", dueToday > 0 ? "font-medium" : "text-subtle")}>
                    {dueToday} {t.common.due}
                  </span>
                  <span className="hidden text-right text-sm text-muted-foreground tabular-nums sm:block">
                    {totalCards} {t.common.cards}
                  </span>
                  <span className="col-span-2 space-y-1 sm:col-span-1">
                    <span className="flex justify-between text-caption text-subtle">
                      <span>
                        {t.dashboard.mastered} {pct(mastered)}
                      </span>
                      <span className="tabular-nums">
                        {t.dashboard.retentionShort} {r.rate === null ? "–" : pct(r.rate)}
                      </span>
                    </span>
                    <span className="block h-1 overflow-hidden rounded-full bg-secondary">
                      <span className="block h-full rounded-full bg-success" style={{ width: pct(mastered) }} />
                    </span>
                  </span>
                </Link>
              </motion.li>
            ))}
          </ul>
        )}
      </section>

      <p className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
        <span className={cn("size-1.5 rounded-full", activeKeys > 0 ? "bg-success" : "bg-warning")} aria-hidden />
        {activeKeys === 0 ? t.dashboard.keyStatusNone : format(t.dashboard.keyStatusSome, { n: activeKeys })}
        <Link href="/settings#vault" className="font-medium text-brand hover:underline">
          {t.dashboard.keyStatus}
        </Link>
      </p>
    </div>
  );
}
