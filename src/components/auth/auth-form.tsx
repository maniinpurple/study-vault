"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";

import { useAuthLanguage } from "@/components/auth/auth-language";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { LANGUAGES } from "@/lib/constants";
import { safeNextPath } from "@/lib/routes";
import { loginAction, registerAction, type AuthFormState } from "@/server/auth-actions";
import { cn } from "@/lib/utils";

/** Shared sign-in / registration form: wordmark, serif title, fields, one primary action, a link to the other page. */
export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const { language, setLanguage, t } = useAuthLanguage();
  const next = safeNextPath(useSearchParams().get("next"));
  const [state, action, pending] = React.useActionState<AuthFormState, FormData>(mode === "login" ? loginAction : registerAction, {});
  const copy = t.auth[mode];
  const error = state.error ? ((t.auth.errors as Record<string, string>)[state.error] ?? t.auth.errors.UNKNOWN) : null;
  const other = mode === "login" ? "/register" : "/login";
  // Errors belong to a field so the message sits next to what needs fixing.
  const fieldOf = (code: string | undefined) => (code === "NAME_REQUIRED" ? "name" : code === "INVALID_EMAIL" || code === "EMAIL_TAKEN" ? "email" : code === "PASSWORD_TOO_SHORT" || code === "PASSWORD_TOO_LONG" || code === "PASSWORD_REQUIRED" ? "password" : null);
  const errorField = fieldOf(state.error);
  const formLevel = error && !errorField;

  return (
    <div className="w-full max-w-sm space-y-8">
      <div className="space-y-6">
        <p className="flex items-center gap-2 font-serif text-[17px] font-medium">
          <span aria-hidden className="grid size-6 place-items-center rounded-md bg-primary text-[14px] font-semibold text-primary-foreground">
            V
          </span>
          {t.app.name}
        </p>
        <div className="space-y-1.5">
          <h1 className="text-display">{copy.title}</h1>
          <p className="text-muted-foreground">{copy.subtitle}</p>
        </div>
      </div>

      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <input type="hidden" name="language" value={language} />
        {mode === "register" && (
          <Field label={t.auth.name} htmlFor="auth-name" error={errorField === "name" ? error : null}>
            <Input id="auth-name" name="name" autoComplete="name" defaultValue={state.values?.name} placeholder={t.auth.namePlaceholder} maxLength={80} aria-invalid={errorField === "name" || undefined} data-autofocus autoFocus />
          </Field>
        )}
        <Field label={t.auth.email} htmlFor="auth-email" error={errorField === "email" ? error : null}>
          <Input id="auth-email" name="email" type="email" inputMode="email" autoComplete="email" defaultValue={state.values?.email} placeholder={t.auth.emailPlaceholder} maxLength={254} aria-invalid={errorField === "email" || undefined} autoFocus={mode === "login"} />
        </Field>
        <Field label={t.auth.password} htmlFor="auth-password" hint={mode === "register" ? t.auth.passwordHint : undefined} error={errorField === "password" ? error : null}>
          <Input id="auth-password" name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} maxLength={200} aria-invalid={errorField === "password" || undefined} />
        </Field>

        {formLevel && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" disabled={pending} className="h-10 w-full">
          {pending ? copy.submitting : copy.submit}
        </Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">
          {copy.switchPrompt}{" "}
          <Link href={next === "/" ? other : `${other}?next=${encodeURIComponent(next)}`} className="font-medium text-brand hover:underline">
            {copy.switchLink}
          </Link>
        </p>
        <div role="radiogroup" aria-label={t.header.language} className="flex gap-1 text-caption">
          {LANGUAGES.map((code) => (
            <button key={code} type="button" role="radio" aria-checked={code === language} onClick={() => setLanguage(code)} title={t.language[code]} className={cn("rounded px-1.5 py-0.5 tabular-nums", code === language ? "font-medium text-foreground" : "text-subtle hover:text-foreground")}>
              {code}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
