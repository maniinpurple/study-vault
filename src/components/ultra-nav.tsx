"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AccountMenu } from "@/components/account-menu";
import { useApp } from "@/components/app-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { format } from "@/lib/i18n";
import { dueCountsBySubject } from "@/lib/review";
import { timezoneOffsetMinutes } from "@/lib/stats";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", key: "overview" },
  { href: "/review", key: "review" },
  { href: "/vault", key: "vault" },
  { href: "/sources", key: "sources" },
  { href: "/lab", key: "practice" },
  { href: "/settings", key: "settings" },
] as const;

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

/**
 * Ultra-minimal navigation: one row of plain words. No icons, no backgrounds, no borders; the current page is bold, the others
 * muted. Always in the DOM, shown by CSS only in Ultra-minimal (`.vl-ultra-only`), so switching modes never reloads anything.
 * The document viewer has its own bar and hides this one. Language, light / dark and the account sit at the end of the row.
 */
export function UltraNav() {
  const { snapshot, loadedAt, t } = useApp();
  const pathname = usePathname();
  if (/^\/sources\/[^/]+/.test(pathname)) return null;

  const counts = snapshot ? dueCountsBySubject(snapshot.cards, loadedAt, timezoneOffsetMinutes(snapshot.user.timezone, loadedAt)) : new Map<string, number>();
  const due = [...counts.values()].reduce((sum, n) => sum + n, 0);
  const items = snapshot?.user.role === "ADMIN" ? [...ITEMS, { href: "/admin", key: "admin" } as const] : ITEMS;

  return (
    <header className="vl-ultra-only mx-auto w-full max-w-5xl px-8 pt-8">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3">
        <nav aria-label={t.nav.main} className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
          {items.map(({ href, key }) => {
            const active = isActive(pathname, href);
            const badge = key === "review" && due > 0 ? due : null;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={badge ? `${t.nav[key]} · ${format(t.nav.dueToday, { n: badge })}` : undefined}
                className={cn("text-sm transition-colors", active ? "font-semibold text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                {t.nav[key]}
                {badge !== null && <span className="ml-1.5 text-caption font-normal text-subtle tabular-nums">{badge}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-1">
          <LanguageSwitcher />
          <ThemeSwitcher />
          <AccountMenu side="bottom" />
        </div>
      </div>
    </header>
  );
}
