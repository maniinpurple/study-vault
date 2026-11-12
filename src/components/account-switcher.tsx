"use client";

import { Check, Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { useApp } from "@/components/app-provider";
import { Dropdown, MenuItem } from "@/components/dropdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import type { User } from "@/lib/repo/types";

function initials(user: User): string {
  const name = user.displayName?.trim() || user.email;
  return name
    .split(/\s+/)
    .slice(-2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function Avatar({ user, className = "size-8" }: { user: User; className?: string }) {
  return (
    <span className={`${className} grid place-items-center rounded-full bg-gradient-to-br from-glow-from to-glow-to text-[11px] font-semibold text-white`} aria-hidden>
      {initials(user)}
    </span>
  );
}

export function AccountSwitcher() {
  const { users, snapshot, t, actions } = useApp();
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);
  const current = snapshot?.user;
  if (!current) return null;

  return (
    <Dropdown
      className="w-72"
      trigger={({ open, toggle, id }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          aria-label={`${t.header.account}: ${current.displayName ?? current.email}`}
          className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Avatar user={current} />
        </button>
      )}
    >
      {(close) => (
        <div role="menu" aria-label={t.header.switchAccount} className="space-y-1">
          <p className="px-2.5 pt-1 pb-1.5 text-xs font-medium text-muted-foreground">{t.header.switchAccount}</p>
          {users.map((user) => (
            <MenuItem
              key={user.id}
              role="menuitemradio"
              aria-checked={user.id === current.id}
              active={user.id === current.id}
              onClick={() => {
                close();
                void actions.switchAccount(user.id);
              }}
            >
              <Avatar user={user} className="size-6" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{user.displayName ?? user.email}</span>
                <span className="metric block truncate text-[11px] text-muted-foreground">{user.email}</span>
              </span>
              {user.id === current.id && <Check className="size-4" aria-hidden />}
            </MenuItem>
          ))}
          <div className="my-1 border-t border-border" />
          {adding ? (
            <form
              className="flex gap-2 p-1"
              onSubmit={(e) => {
                e.preventDefault();
                if (!name.trim()) return;
                void actions.createAccount(name.trim()).then(() => {
                  setName("");
                  setAdding(false);
                  close();
                });
              }}
            >
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t.header.accountName} aria-label={t.header.accountName} maxLength={60} />
              <Button type="submit" size="lg" disabled={!name.trim()}>
                {t.common.create}
              </Button>
            </form>
          ) : (
            <MenuItem role="menuitem" onClick={() => setAdding(true)}>
              <Plus className="size-4" aria-hidden />
              {t.header.newAccount}
            </MenuItem>
          )}
          <MenuItem
            role="menuitem"
            className="text-destructive"
            onClick={() => {
              if (users.length <= 1) return setMessage(t.header.lastAccount);
              if (!window.confirm(t.header.deleteAccountConfirm)) return;
              close();
              void actions.deleteAccount(current.id);
            }}
          >
            <Trash2 className="size-4" aria-hidden />
            {t.header.deleteAccount}
          </MenuItem>
          {message && (
            <p role="alert" className="px-2.5 py-1 text-xs text-destructive">
              {message}
            </p>
          )}
        </div>
      )}
    </Dropdown>
  );
}
