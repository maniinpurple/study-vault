"use client";

import { CalendarClock, FlaskConical, LayoutDashboard, Layers, Plus, ScanLine, Settings, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { AccountSwitcher } from "@/components/account-switcher";
import { useApp } from "@/components/app-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { SubjectDialog } from "@/components/subject-dialog";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", key: "dashboard", icon: LayoutDashboard },
  { href: "/subjects", key: "subjects", icon: Layers },
  { href: "/review", key: "review", icon: CalendarClock },
  { href: "/scanner", key: "scanner", icon: ScanLine },
  { href: "/lab", key: "examPrep", icon: FlaskConical },
  { href: "/settings", key: "settings", icon: Settings },
] as const;

function FloatingNav() {
  const { t } = useApp();
  const pathname = usePathname();

  return (
    <header className="pointer-events-none fixed inset-x-0 top-3 z-40 px-3">
      <div className="pill-surface pointer-events-auto mx-auto flex max-w-5xl items-center gap-1 rounded-full py-1.5 pr-2 pl-3 sm:gap-2">
        <Link href="/" className="flex shrink-0 items-center gap-2 rounded-full pr-1 outline-none sm:pr-2 focus-visible:ring-3 focus-visible:ring-ring/50" aria-label={t.app.name}>
          <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-glow-from to-glow-to text-white">
            <ShieldCheck className="size-4" aria-hidden />
          </span>
          <span className="hidden text-sm font-semibold tracking-tight xl:inline">{t.app.name}</span>
        </Link>
        <nav aria-label={t.nav.main} className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] sm:justify-center [&::-webkit-scrollbar]:hidden">
          {NAV.map(({ href, key, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                title={t.nav[key]}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1.5 text-sm sm:px-2.5 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 xl:px-3.5",
                  active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                <span className={cn("whitespace-nowrap", active ? "hidden sm:inline" : "hidden lg:inline")}>{t.nav[key]}</span>
              </Link>
            );
          })}
        </nav>
        <div className="flex shrink-0 items-center gap-1.5">
          <ThemeSwitcher />
          <LanguageSwitcher />
          <AccountSwitcher />
        </div>
      </div>
    </header>
  );
}

/** Subject tabs: "All" + one chip per subject + add. Selecting a chip scopes the dashboard and workspace. */
function SubjectBar() {
  const { snapshot, activeSubjectId, actions, t } = useApp();
  const [creating, setCreating] = React.useState(false);
  const subjects = snapshot?.subjects.filter((s) => s.archivedAt === null) ?? [];

  const chip = "flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <>
      <div role="tablist" aria-label={t.subjects.title} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <button type="button" role="tab" aria-selected={activeSubjectId === null} onClick={() => actions.setActiveSubject(null)} className={cn(chip, activeSubjectId === null ? "border-primary/60 bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
          {t.subjects.all}
        </button>
        {subjects.map((subject) => {
          const active = subject.id === activeSubjectId;
          return (
            <button key={subject.id} type="button" role="tab" aria-selected={active} onClick={() => actions.setActiveSubject(subject.id)} className={cn(chip, active ? "border-primary/60 bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:text-foreground")}>
              <span className="size-2 rounded-full" style={{ backgroundColor: subject.color ?? "var(--primary)" }} aria-hidden />
              {subject.name}
            </button>
          );
        })}
        <button type="button" onClick={() => setCreating(true)} className={cn(chip, "border-dashed border-border text-muted-foreground hover:text-foreground")}>
          <Plus className="size-4" aria-hidden />
          {t.subjects.add}
        </button>
      </div>
      <SubjectDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status, t } = useApp();
  const pathname = usePathname();

  if (status === "error") {
    return (
      <div className="bg-grid grid min-h-dvh place-items-center px-6">
        <p role="alert" className="metric text-sm text-destructive">
          {t.app.loadError}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-grid min-h-dvh">
      <FloatingNav />
      <main className="mx-auto w-full max-w-6xl space-y-6 px-4 pt-24 pb-16 sm:px-6">
        {status === "ready" && pathname !== "/settings" && <SubjectBar />}
        {children}
      </main>
    </div>
  );
}
