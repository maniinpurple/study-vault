"use client";

import { CalendarClock, FlaskConical, KeyRound, Layers, Plus, ScanLine, Flame, Target, Library } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import * as React from "react";

import { useVault } from "@/components/app-provider";
import { CrosshairCard } from "@/components/crosshair-card";
import { SubjectDialog } from "@/components/subject-dialog";
import { Badge } from "@/components/ui/badge";
import { activityByDay, computeRetention, countDueToday, reviewStreak, subjectOverviews, timezoneOffsetMinutes } from "@/lib/stats";
import { format } from "@/lib/i18n";
import { cn } from "@/lib/utils";

function RetentionRing({ rate, target }: { rate: number | null; target: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const filled = rate === null ? 0 : Math.max(0, Math.min(1, rate));
  return (
    <svg viewBox="0 0 100 100" className="size-28 shrink-0 -rotate-90" role="img" aria-label={rate === null ? "—" : `${Math.round(filled * 100)}%`}>
      <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--border)" strokeWidth="7" />
      <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--glow-from)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${filled * circumference} ${circumference}`} className="transition-[stroke-dasharray] duration-500" />
      {/* target tick */}
      <line x1="50" y1="3" x2="50" y2="13" stroke="var(--glow-to)" strokeWidth="2" transform={`rotate(${target * 360} 50 50)`} />
    </svg>
  );
}

function StatTile({ icon: Icon, label, value, hint, accent }: { icon: typeof Target; label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <CrosshairCard className="space-y-3 p-5">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-4 text-primary" aria-hidden />
        {label}
      </div>
      <p className={cn("metric text-4xl font-semibold", accent && "text-glow-gradient")}>{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </CrosshairCard>
  );
}

export function Dashboard() {
  const { snapshot, user, t, locale, loadedAt, activeSubjectId, actions } = useVault();
  const reduceMotion = useReducedMotion();
  const [creating, setCreating] = React.useState(false);

  const offset = timezoneOffsetMinutes(user.timezone, loadedAt);
  const subjects = snapshot.subjects.filter((s) => s.archivedAt === null);
  const scopeSubject = subjects.find((s) => s.id === activeSubjectId) ?? null;
  const scopeId = scopeSubject?.id ?? null;

  const scopedCards = scopeId ? snapshot.cards.filter((c) => c.subjectId === scopeId) : snapshot.cards;
  const scopedIds = new Set(scopedCards.map((c) => c.id));
  const cards = scopedCards;
  const logs = scopeId ? snapshot.logs.filter((l) => scopedIds.has(l.cardId)) : snapshot.logs;

  const active = cards.filter((c) => !c.isSuspended && c.archivedAt === null);
  const retention = computeRetention(logs, loadedAt, 30);
  const due = countDueToday(active, loadedAt, offset);
  const streak = reviewStreak(logs, loadedAt, offset);
  const activity = activityByDay(logs, loadedAt, offset, 14);
  const maxReviews = Math.max(1, ...activity.map((d) => d.reviews));
  const overviews = subjectOverviews(subjects, snapshot.cards, snapshot.logs, loadedAt, offset);
  const activeKeys = snapshot.apiKeys.filter((k) => k.isActive).length;
  const target = user.desiredRetention;
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "numeric", timeZone: user.timezone });
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  const fadeIn = (i: number) => (reduceMotion ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, delay: i * 0.04 } });

  return (
    <div className="space-y-6">
      <motion.section {...fadeIn(0)} className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          <span className="text-glow-gradient">{format(t.dashboard.greeting, { name: user.displayName ?? "" })}</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {due > 0 ? format(t.dashboard.greetingSub, { n: due }) : t.dashboard.greetingNone}
          <span className="mx-2 text-border">·</span>
          <span>{scopeSubject?.name ?? t.dashboard.allSubjects}</span>
        </p>
      </motion.section>

      <motion.section {...fadeIn(1)} aria-label={t.dashboard.title} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CrosshairCard glow className="flex items-center gap-4 p-5 sm:col-span-2 lg:col-span-1">
          <RetentionRing rate={retention.rate} target={target} />
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">{t.dashboard.retention}</p>
            <p className="metric text-4xl font-semibold text-glow-gradient">{retention.rate === null ? "—" : pct(retention.rate)}</p>
            <p className="text-xs text-muted-foreground">{retention.rate === null ? t.dashboard.retentionEmpty : format(t.dashboard.retentionHint, { n: retention.reviews })}</p>
            <p className="metric text-[11px] text-muted-foreground">{format(t.dashboard.retentionTarget, { n: Math.round(target * 100) })}</p>
          </div>
        </CrosshairCard>
        <StatTile icon={CalendarClock} label={t.dashboard.dueToday} value={String(due)} hint={t.dashboard.dueHint} accent={due > 0} />
        <StatTile icon={Library} label={t.dashboard.totalCards} value={String(active.length)} hint={format(t.dashboard.totalHint, { n: active.filter((c) => c.isHighYield).length })} />
        <StatTile icon={Flame} label={t.dashboard.streak} value={String(streak)} hint={t.dashboard.streakHint} />
      </motion.section>

      <div className="grid gap-4 lg:grid-cols-5">
        <motion.div {...fadeIn(2)} className="lg:col-span-3">
          <CrosshairCard className="h-full space-y-4">
            <div>
              <h2 className="text-sm font-semibold">{t.dashboard.activity}</h2>
              <p className="text-xs text-muted-foreground">{t.dashboard.activityHint}</p>
            </div>
            <ul className="flex h-36 items-end gap-1.5" aria-label={t.dashboard.activity}>
              {activity.map((day, i) => (
                <li key={day.day.toISOString()} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" title={`${dayFmt.format(day.day)}: ${day.reviews}`}>
                  <span className="metric text-[10px] text-muted-foreground">{day.reviews || ""}</span>
                  <span
                    className={cn("w-full rounded-t-sm", i === activity.length - 1 ? "bg-gradient-to-t from-glow-from to-glow-to" : "bg-primary/45")}
                    style={{ height: `${Math.max(day.reviews === 0 ? 2 : 6, (day.reviews / maxReviews) * 100)}%`, opacity: day.reviews === 0 ? 0.35 : 1 }}
                  />
                </li>
              ))}
            </ul>
          </CrosshairCard>
        </motion.div>

        <motion.div {...fadeIn(3)} className="lg:col-span-2">
          <CrosshairCard className="h-full space-y-3">
            <h2 className="text-sm font-semibold">{t.dashboard.quickStart}</h2>
            <ul className="grid gap-2">
              <QuickAction icon={ScanLine} title={t.dashboard.scan} hint={t.dashboard.scanHint} href="/scanner" />
              <QuickAction icon={CalendarClock} title={t.dashboard.review} hint={`${t.dashboard.reviewHint} · ${due} ${t.common.due}`} href="/review" />
              <QuickAction icon={FlaskConical} title={t.dashboard.lab} hint={t.dashboard.labHint} href="/lab" />
              <QuickAction icon={Plus} title={t.dashboard.addSubject} hint={t.dashboard.addSubjectHint} onClick={() => setCreating(true)} />
              <QuickAction icon={KeyRound} title={t.dashboard.addKey} hint={activeKeys === 0 ? t.dashboard.keyStatusNone : format(t.dashboard.keyStatusSome, { n: activeKeys })} href="/settings#vault" />
            </ul>
          </CrosshairCard>
        </motion.div>
      </div>

      <section aria-labelledby="subjects-overview" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 id="subjects-overview" className="text-sm font-semibold">{t.dashboard.subjectOverview}</h2>
          <Link href="/subjects" className="text-xs text-primary hover:underline">{t.dashboard.viewAll} →</Link>
        </div>
        {overviews.length === 0 ? (
          <CrosshairCard className="space-y-1 py-10 text-center">
            <Layers className="mx-auto size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium">{t.dashboard.noSubjects}</p>
            <p className="text-xs text-muted-foreground">{t.dashboard.noSubjectsBody}</p>
          </CrosshairCard>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {overviews.map(({ subject, totalCards, dueToday, highYield, mastered, retention: r, daysToExam }, i) => (
              <motion.li key={subject.id} {...fadeIn(4 + i)}>
                <Link href="/subjects" onClick={() => actions.setActiveSubject(subject.id)} className="block outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                  <CrosshairCard className="space-y-4 p-5 transition-colors hover:border-primary/50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: subject.color ?? "var(--primary)" }} aria-hidden />
                        <h3 className="truncate text-sm font-semibold">{subject.name}</h3>
                      </div>
                      {dueToday > 0 && <Badge className="metric shrink-0">{dueToday} {t.common.due}</Badge>}
                    </div>
                    <dl className="grid grid-cols-3 gap-2 text-xs">
                      <div><dt className="text-muted-foreground">{t.common.cards}</dt><dd className="metric text-lg font-semibold">{totalCards}</dd></div>
                      <div><dt className="text-muted-foreground">{t.dashboard.retention.split(" ")[0]}</dt><dd className="metric text-lg font-semibold">{r.rate === null ? "—" : pct(r.rate)}</dd></div>
                      <div><dt className="text-muted-foreground">{t.dashboard.highYield}</dt><dd className="metric text-lg font-semibold">{highYield}</dd></div>
                    </dl>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-[11px] text-muted-foreground"><span>{t.dashboard.mastered}</span><span className="metric">{pct(mastered)}</span></div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-glow-from to-glow-to" style={{ width: pct(mastered) }} /></div>
                    </div>
                    {daysToExam !== null && (
                      <p className="metric text-[11px] text-muted-foreground">{daysToExam >= 0 ? format(t.subjects.examIn, { n: daysToExam }) : t.subjects.examPassed}</p>
                    )}
                  </CrosshairCard>
                </Link>
              </motion.li>
            ))}
          </ul>
        )}
      </section>

      <SubjectDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function QuickAction({ icon: Icon, title, hint, href, onClick, disabled, soon }: { icon: typeof Plus; title: string; hint: string; href?: string; onClick?: () => void; disabled?: boolean; soon?: string }) {
  const body = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-4" aria-hidden /></span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
      {soon && <Badge variant="outline" className="shrink-0">{soon}</Badge>}
    </>
  );
  const cls = "flex w-full items-center gap-3 rounded-lg border border-border bg-muted/30 p-2.5 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
  return (
    <li>
      {href ? (
        <Link href={href} className={cn(cls, "hover:border-primary/50 hover:bg-muted/60")}>{body}</Link>
      ) : (
        <button type="button" onClick={onClick} disabled={disabled} className={cn(cls, disabled ? "cursor-not-allowed opacity-60" : "hover:border-primary/50 hover:bg-muted/60")}>{body}</button>
      )}
    </li>
  );
}
