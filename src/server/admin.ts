import "server-only";

import { redirect } from "next/navigation";

import { getPrisma } from "@/lib/db/prisma";
import type { Language, UserRole } from "@/lib/constants";
import { currentUserId } from "@/server/session";

export interface AdminViewer {
  id: string;
  uiLanguage: Language;
}

/**
 * Gate for everything under /admin. The role is read from the database on every request (not from the session
 * cookie), so demoting an admin takes effect immediately. Signed-out visitors go to /login, regular users to /.
 */
export async function requireAdmin(): Promise<AdminViewer> {
  const id = await currentUserId();
  if (!id) redirect("/login");
  const user = await getPrisma().user.findUnique({ where: { id }, select: { id: true, role: true, uiLanguage: true } });
  if (!user || user.role !== "ADMIN") redirect("/");
  return { id: user.id, uiLanguage: user.uiLanguage };
}

export interface AdminOverview {
  totals: { users: number; subjects: number; snippets: number; sources: number };
  users: { id: string; email: string; displayName: string | null; role: UserRole; createdAt: Date }[];
}

/**
 * System-wide figures. This is the one place that reads across accounts, and it reads COUNTS and account identity only
 * (email, role, join date) — never anyone's problems, notes, files or API keys. Call `requireAdmin()` first.
 */
export async function loadAdminOverview(): Promise<AdminOverview> {
  const db = getPrisma();
  const [users, subjects, snippets, sources, list] = await Promise.all([
    db.user.count(),
    db.subject.count(),
    db.mistakeCard.count({ where: { archivedAt: null } }),
    db.examUpload.count(),
    db.user.findMany({ select: { id: true, email: true, displayName: true, role: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 200 }),
  ]);
  return { totals: { users, subjects, snippets, sources }, users: list };
}
