"use client";

import { useApp } from "@/components/app-provider";
import { Dropdown, MenuItem } from "@/components/dropdown";
import type { User } from "@/lib/repo/types";
import { signOutAction } from "@/server/auth-actions";

function initials(user: Pick<User, "displayName" | "email">): string {
  const name = user.displayName?.trim() || user.email;
  return name
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/** The signed-in account: who you are, and the way out. There is exactly one account per session. */
export function AccountMenu({ side = "top" }: { side?: "top" | "bottom" }) {
  const { snapshot, t } = useApp();
  const user = snapshot?.user;
  if (!user) return null;

  return (
    <Dropdown
      className="w-64"
      side={side}
      align={side === "top" ? "start" : "end"}
      trigger={({ open, toggle, id }) => (
        <button type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} aria-label={`${t.header.account}: ${user.displayName ?? user.email}`} className="rounded-full">
          <span className="grid size-8 place-items-center rounded-full bg-primary text-[12px] font-semibold text-primary-foreground" aria-hidden>
            {initials(user)}
          </span>
        </button>
      )}
    >
      {() => (
        <div role="menu" aria-label={t.header.account} className="space-y-1">
          <div className="px-2.5 pt-1.5 pb-2">
            <p className="truncate text-sm font-medium">{user.displayName ?? user.email}</p>
            <p className="truncate text-caption text-muted-foreground">{user.email}</p>
          </div>
          <div className="border-t border-border pt-1">
            <MenuItem role="menuitem" onClick={() => void signOutAction()}>
              {t.nav.signOut}
            </MenuItem>
          </div>
        </div>
      )}
    </Dropdown>
  );
}
