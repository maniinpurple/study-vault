"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { CalendarCheck, ChevronDown, FileText, FlaskConical, LayoutGrid, Library, Menu, PanelLeft, Plus, Settings, ShieldCheck, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { AccountMenu } from "@/components/account-menu";
import { useApp } from "@/components/app-provider";
import { Dropdown, MenuItem } from "@/components/dropdown";
import { LanguageSwitcher } from "@/components/language-switcher";
import { FloatingTools } from "@/components/floating-tools";
import { SubjectDialog } from "@/components/subject-dialog";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { useApplyAppearance } from "@/components/use-appearance";
import { useStoredFlag } from "@/components/use-stored-flag";
import { STORAGE_KEYS, swatchColor } from "@/lib/constants";
import { format } from "@/lib/i18n";
import { fade, spring } from "@/lib/motion";
import { dueCountsBySubject } from "@/lib/review";
import { timezoneOffsetMinutes } from "@/lib/stats";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", key: "overview", icon: LayoutGrid },
  { href: "/review", key: "review", icon: CalendarCheck },
  { href: "/vault", key: "vault", icon: Library },
  { href: "/sources", key: "sources", icon: FileText },
  { href: "/lab", key: "practice", icon: FlaskConical },
] as const;

/** Only shown to administrators; /admin re-checks the role on the server. */
const ADMIN_ITEM = { href: "/admin", key: "admin", icon: ShieldCheck } as const;

const WIDTH = { expanded: 248, collapsed: 60 };
const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

const row = "relative flex h-8 items-center gap-2.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:text-foreground";

/** Sidebar body, shared by the desktop rail and the mobile sheet. `layoutScope` keeps their active pills independent. */
function SidebarBody({ collapsed, layoutScope, onNavigate, onToggle }: { collapsed: boolean; layoutScope: string; onNavigate?: () => void; onToggle?: () => void }) {
  const { snapshot, status, loadedAt, activeSubjectId, actions, t } = useApp();
  const pathname = usePathname();
  const [creating, setCreating] = React.useState(false);

  const subjects = snapshot?.subjects.filter((s) => s.archivedAt === null) ?? [];
  const counts = snapshot ? dueCountsBySubject(snapshot.cards, loadedAt, timezoneOffsetMinutes(snapshot.user.timezone, loadedAt)) : new Map<string, number>();
  const dueTotal = [...counts.values()].reduce((sum, n) => sum + n, 0);

  return (
    <div className="flex h-full flex-col">
      <div className={cn("flex h-14 shrink-0 items-center gap-2 px-3", collapsed && "justify-center px-0")}>
        {!collapsed && (
          <Link href="/" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1">
            <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-md bg-primary font-serif text-[14px] font-semibold text-primary-foreground">V</span>
            <span className="truncate font-serif text-[15px] font-medium tracking-tight">{t.app.name}</span>
          </Link>
        )}
        {onToggle && (
          <Button variant="ghost" size="icon-sm" onClick={onToggle} aria-label={collapsed ? t.nav.expand : t.nav.collapse} title={collapsed ? t.nav.expand : t.nav.collapse} aria-expanded={!collapsed}>
            <PanelLeft />
          </Button>
        )}
      </div>

      <nav aria-label={t.nav.main} className="space-y-0.5 px-2">
        {(snapshot?.user.role === "ADMIN" ? [...NAV, ADMIN_ITEM] : NAV).map(({ href, key, icon: Icon }) => {
          const active = isActive(pathname, href);
          const badge = key === "review" && dueTotal > 0 ? dueTotal : null;
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              aria-label={badge ? `${t.nav[key]} · ${format(t.nav.dueToday, { n: badge })}` : t.nav[key]}
              title={collapsed ? t.nav[key] : undefined}
              className={cn(row, active && "text-foreground", collapsed && "justify-center px-0")}
            >
              {active && <motion.span layoutId={`${layoutScope}-active`} transition={spring.snappy} className="absolute inset-0 rounded-md border-2 border-border bg-accent shadow-xs" aria-hidden />}
              <Icon className="relative size-[18px] shrink-0" aria-hidden />
              {!collapsed && <span className={cn("relative flex-1 truncate", active && "font-medium")}>{t.nav[key]}</span>}
              {badge !== null && !collapsed && <span className="relative text-caption text-subtle tabular-nums">{badge}</span>}
              {badge !== null && collapsed && <span aria-hidden className="absolute top-1.5 right-3 size-1.5 rounded-full bg-brand" />}
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 flex min-h-0 flex-1 flex-col px-2">
        {!collapsed && (
          <div className="flex h-7 items-center justify-between pr-0.5 pl-2">
            <h2 className="text-overline">{t.nav.subjects}</h2>
            <div className="flex">
              <Link href="/subjects" onClick={onNavigate} aria-label={t.nav.manageSubjects} title={t.nav.manageSubjects} className="grid size-6 place-items-center rounded-md text-subtle hover:bg-muted hover:text-foreground">
                <SlidersHorizontal className="size-3.5" aria-hidden />
              </Link>
              <button type="button" onClick={() => setCreating(true)} aria-label={t.nav.newSubject} title={t.nav.newSubject} className="grid size-6 place-items-center rounded-md text-subtle hover:bg-muted hover:text-foreground">
                <Plus className="size-3.5" aria-hidden />
              </button>
            </div>
          </div>
        )}
        {status === "ready" && (
          <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pb-2" aria-label={t.nav.subjects}>
            <li>
              <button type="button" aria-pressed={activeSubjectId === null} onClick={() => actions.setActiveSubject(null)} title={collapsed ? t.nav.allSubjects : undefined} className={cn(row, "w-full", activeSubjectId === null && "bg-muted text-foreground", collapsed && "justify-center px-0")}>
                <span aria-hidden className="grid size-[18px] shrink-0 place-items-center">
                  <span className="size-2 rounded-full border border-subtle" />
                </span>
                {!collapsed && <span className="flex-1 truncate text-left">{t.nav.allSubjects}</span>}
              </button>
            </li>
            {subjects.map((subject) => {
              const active = subject.id === activeSubjectId;
              const due = counts.get(subject.id) ?? 0;
              return (
                <li key={subject.id}>
                  <button type="button" aria-pressed={active} onClick={() => actions.setActiveSubject(subject.id)} title={collapsed ? subject.name : undefined} className={cn(row, "w-full", active && "bg-muted text-foreground", collapsed && "justify-center px-0")}>
                    <span aria-hidden className="grid size-[18px] shrink-0 place-items-center">
                      <span className="size-2 rounded-full" style={{ backgroundColor: swatchColor(subject.color) ?? "var(--subtle-foreground)" }} />
                    </span>
                    {!collapsed && <span className={cn("flex-1 truncate text-left", active && "font-medium")}>{subject.name}</span>}
                    {!collapsed && due > 0 && <span className="text-caption text-subtle tabular-nums">{due}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 space-y-1 border-t border-border p-2">
        <Link href="/settings" onClick={onNavigate} aria-current={isActive(pathname, "/settings") ? "page" : undefined} title={collapsed ? t.nav.settings : undefined} className={cn(row, isActive(pathname, "/settings") && "bg-secondary text-foreground", collapsed && "justify-center px-0")}>
          <Settings className="size-[18px] shrink-0" aria-hidden />
          {!collapsed && <span className="flex-1 truncate">{t.nav.settings}</span>}
        </Link>
        <div className={cn("flex items-center gap-1 pt-1", collapsed ? "flex-col" : "px-1")}>
          <AccountMenu />
          {!collapsed && <span className="min-w-0 flex-1 truncate px-1 text-sm">{snapshot?.user.displayName ?? ""}</span>}
          {!collapsed && <LanguageSwitcher />}
          <ThemeSwitcher />
        </div>
      </div>

      <SubjectDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

/**
 * Horizontal navigation for the "Top bar" layout (Settings → Appearance → Layout), shown from 1024px up. It carries everything the
 * sidebar does: the five destinations, the global subject filter (as a menu), and the settings / account / language / mode controls.
 * Labels collapse to icons between 1024px and 1280px so the bar never wraps.
 */
function TopNavBody() {
  const { snapshot, status, loadedAt, activeSubjectId, actions, t } = useApp();
  const pathname = usePathname();
  const [creating, setCreating] = React.useState(false);

  const subjects = snapshot?.subjects.filter((s) => s.archivedAt === null) ?? [];
  const counts = snapshot ? dueCountsBySubject(snapshot.cards, loadedAt, timezoneOffsetMinutes(snapshot.user.timezone, loadedAt)) : new Map<string, number>();
  const dueTotal = [...counts.values()].reduce((sum, n) => sum + n, 0);
  const current = subjects.find((subject) => subject.id === activeSubjectId);
  const item = "relative flex h-9 shrink-0 items-center gap-2 rounded-md px-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground";

  return (
    <>
      <Link href="/" className="flex shrink-0 items-center gap-2 rounded-md pr-2">
        <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-[14px] font-semibold text-primary-foreground">V</span>
        <span className="font-semibold tracking-tight">{t.app.name}</span>
      </Link>

      <nav aria-label={t.nav.main} className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {(snapshot?.user.role === "ADMIN" ? [...NAV, ADMIN_ITEM] : NAV).map(({ href, key, icon: Icon }) => {
          const active = isActive(pathname, href);
          const badge = key === "review" && dueTotal > 0 ? dueTotal : null;
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              aria-label={badge ? `${t.nav[key]} · ${format(t.nav.dueToday, { n: badge })}` : t.nav[key]}
              title={t.nav[key]}
              className={cn(item, active && "text-foreground")}
            >
              {active && <motion.span layoutId="topnav-active" transition={spring.snappy} className="absolute inset-0 rounded-md border-2 border-border bg-accent shadow-xs" aria-hidden />}
              <Icon className="relative size-[18px] shrink-0" aria-hidden />
              <span className={cn("relative hidden xl:inline", active && "font-medium")}>{t.nav[key]}</span>
              {badge !== null && <span className="relative text-caption text-subtle tabular-nums">{badge}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="flex shrink-0 items-center gap-1">
        {status === "ready" && (
          <Dropdown
            className="w-64"
            trigger={({ open, toggle, id }) => (
              <button
                type="button"
                onClick={toggle}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? id : undefined}
                aria-label={t.nav.subjects}
                className="flex h-9 max-w-48 items-center gap-2 rounded-md border-2 border-input bg-card px-2.5 text-sm"
              >
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: swatchColor(current?.color) ?? "var(--subtle-foreground)" }} />
                <span className="truncate">{current?.name ?? t.nav.allSubjects}</span>
                <ChevronDown className="size-4 shrink-0 text-subtle" aria-hidden />
              </button>
            )}
          >
            {(close) => (
              <div role="menu" aria-label={t.nav.subjects} className="max-h-80 space-y-0.5 overflow-y-auto">
                <MenuItem role="menuitemradio" aria-checked={activeSubjectId === null} active={activeSubjectId === null} onClick={() => { actions.setActiveSubject(null); close(); }}>
                  <span className="flex-1 truncate">{t.nav.allSubjects}</span>
                </MenuItem>
                {subjects.map((subject) => {
                  const due = counts.get(subject.id) ?? 0;
                  return (
                    <MenuItem key={subject.id} role="menuitemradio" aria-checked={subject.id === activeSubjectId} active={subject.id === activeSubjectId} onClick={() => { actions.setActiveSubject(subject.id); close(); }}>
                      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: swatchColor(subject.color) ?? "var(--subtle-foreground)" }} />
                      <span className="flex-1 truncate">{subject.name}</span>
                      {due > 0 && <span className="text-caption text-subtle tabular-nums">{due}</span>}
                    </MenuItem>
                  );
                })}
                <div className="mt-1 space-y-0.5 border-t border-border pt-1">
                  <Link href="/subjects" onClick={close} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-muted">
                    <SlidersHorizontal className="size-4" aria-hidden />
                    {t.nav.manageSubjects}
                  </Link>
                  <MenuItem onClick={() => { close(); setCreating(true); }}>
                    <Plus className="size-4" aria-hidden />
                    {t.nav.newSubject}
                  </MenuItem>
                </div>
              </div>
            )}
          </Dropdown>
        )}
        <Link href="/settings" aria-label={t.nav.settings} title={t.nav.settings} aria-current={isActive(pathname, "/settings") ? "page" : undefined} className={cn("grid size-9 place-items-center rounded-md text-muted-foreground hover:text-foreground", isActive(pathname, "/settings") && "bg-accent text-foreground")}>
          <Settings className="size-[18px]" aria-hidden />
        </Link>
        <LanguageSwitcher />
        <ThemeSwitcher />
        <AccountMenu side="bottom" />
      </div>

      <SubjectDialog open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status, t } = useApp();
  const [collapsed, setCollapsed] = useStoredFlag(STORAGE_KEYS.sidebar);
  const [sheet, setSheet] = React.useState(false);
  useApplyAppearance();

  React.useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheet(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheet]);

  if (status === "error") {
    return (
      <div className="grid min-h-dvh place-items-center px-6">
        <p role="alert" className="max-w-sm text-center text-sm text-destructive">
          {t.app.loadError}
        </p>
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-dvh">
        <motion.aside
          initial={false}
          animate={{ width: collapsed ? WIDTH.collapsed : WIDTH.expanded }}
          transition={spring.smooth}
          className="vl-rail sticky top-0 h-dvh shrink-0 overflow-hidden border-r-2 border-border bg-sunken"
        >
          <div className="h-full" style={{ width: collapsed ? WIDTH.collapsed : WIDTH.expanded }}>
            {/* The sidebar reads the URL; on dynamic routes that is runtime data, so it streams in behind Suspense. */}
            <React.Suspense fallback={null}>
              <SidebarBody collapsed={collapsed} layoutScope="rail" onToggle={() => setCollapsed(!collapsed)} />
            </React.Suspense>
          </div>
        </motion.aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* "Top bar" layout, 1024px and up. */}
          <header className="vl-topnav sticky top-0 z-30 h-14 shrink-0 items-center gap-3 border-b-2 border-border bg-background px-4">
            <React.Suspense fallback={null}>
              <TopNavBody />
            </React.Suspense>
          </header>
          {/* Under 1024px, whichever layout is chosen. */}
          <header className="vl-mobilebar sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b-2 border-border bg-background px-2">
            <Button variant="ghost" size="icon" onClick={() => setSheet(true)} aria-label={t.nav.openMenu} aria-expanded={sheet}>
              <Menu />
            </Button>
            <span className="font-serif text-[15px] font-medium">{t.app.name}</span>
          </header>
          <main className="min-w-0 flex-1">{children}</main>
        </div>

        <AnimatePresence>
          {sheet && (
            <div className="fixed inset-0 z-50 lg:hidden">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade} className="absolute inset-0 bg-scrim" onClick={() => setSheet(false)} aria-hidden />
              <motion.aside
                role="dialog"
                aria-modal="true"
                aria-label={t.nav.main}
                initial={{ x: -WIDTH.expanded - 24 }}
                animate={{ x: 0 }}
                exit={{ x: -WIDTH.expanded - 24 }}
                transition={spring.smooth}
                className="absolute inset-y-0 left-0 w-[272px] border-r-2 border-border bg-sunken shadow-lg"
              >
                <React.Suspense fallback={null}>
                  <SidebarBody collapsed={false} layoutScope="sheet" onNavigate={() => setSheet(false)} />
                </React.Suspense>
              </motion.aside>
            </div>
          )}
        </AnimatePresence>
      </div>
      {/* Global: the speed-dial button, Scratchpad and Math Pad for every page, so a drawing survives navigation. */}
      <FloatingTools />
    </MotionConfig>
  );
}
