import type { Metadata } from "next";
import { Suspense } from "react";

import { getDictionary, LOCALE_TAG } from "@/lib/i18n";
import { loadAdminOverview, requireAdmin } from "@/server/admin";

export const metadata: Metadata = { title: "Admin" };

/** Session and role are request-time data under Cache Components, so the dashboard streams in behind Suspense. */
export default function AdminPage() {
  return (
    <Suspense fallback={null}>
      <AdminDashboard />
    </Suspense>
  );
}

async function AdminDashboard() {
  const viewer = await requireAdmin();
  const { totals, users } = await loadAdminOverview();
  const t = getDictionary(viewer.uiLanguage);
  const locale = LOCALE_TAG[viewer.uiLanguage];
  const number = new Intl.NumberFormat(locale);
  const date = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" });

  const stats = [
    { label: t.admin.users, value: totals.users },
    { label: t.admin.subjects, value: totals.subjects },
    { label: t.admin.snippets, value: totals.snippets },
    { label: t.admin.sources, value: totals.sources },
  ];

  return (
    <div className="space-y-10">
      <header className="space-y-1.5">
        <h1 className="text-display">{t.admin.title}</h1>
        <p className="max-w-xl text-muted-foreground">{t.admin.subtitle}</p>
      </header>

      <dl aria-label={t.admin.title} className="grid divide-border overflow-hidden rounded-lg border border-border bg-card shadow-xs max-lg:divide-y sm:grid-cols-2 lg:grid-cols-4 lg:divide-x">
        {stats.map((stat) => (
          <div key={stat.label} className="space-y-1 px-5 py-4">
            <dt className="text-caption text-muted-foreground">{stat.label}</dt>
            <dd className="font-serif text-[2rem] leading-10 font-medium tabular-nums">{number.format(stat.value)}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="admin-users" className="space-y-4">
        <div className="flex items-baseline gap-3">
          <h2 id="admin-users" className="text-overline">
            {t.admin.usersTable}
          </h2>
          <span className="text-caption text-subtle tabular-nums">{number.format(totals.users)}</span>
          <span className="h-px flex-1 self-center bg-border" aria-hidden />
        </div>
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-xs">
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                {[t.admin.email, t.admin.name, t.admin.role, t.admin.joined].map((heading) => (
                  <th key={heading} scope="col" className="px-4 py-2.5 text-overline">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="max-w-64 truncate px-4 py-2.5">{user.email}</td>
                  <td className="max-w-48 truncate px-4 py-2.5 text-muted-foreground">{user.displayName ?? "–"}</td>
                  <td className="px-4 py-2.5">
                    <span className={user.role === "ADMIN" ? "rounded-full bg-accent px-2 py-0.5 text-caption font-medium text-accent-foreground" : "text-muted-foreground"}>{t.admin.roles[user.role]}</span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground tabular-nums">{date.format(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-caption text-subtle">{t.admin.privacy}</p>
      </section>
    </div>
  );
}
