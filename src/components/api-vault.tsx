"use client";

import { Eye, EyeOff, KeyRound, Loader2, Plus, ShieldCheck, Star, Trash2, Zap } from "lucide-react";
import * as React from "react";

import { useVault } from "@/components/app-provider";
import { CrosshairCard } from "@/components/crosshair-card";
import { Modal } from "@/components/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { AI_PROVIDER_META, AI_PROVIDERS, type AiProvider, type Language } from "@/lib/constants";
import { format } from "@/lib/i18n";
import type { UserApiKey } from "@/lib/repo/types";

const EMPTY_FORM = { provider: "GEMINI" as AiProvider, label: "", apiKey: "", baseUrl: "", model: "", visionModel: "", language: "" as Language | "" };

function AddKeyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useVault();
  return (
    <Modal open={open} onClose={onClose} title={t.vault.add} description={t.vault.apiKeyNote}>
      {/* <Modal> mounts its children only while open, so the form (and the plaintext key) resets on every open. */}
      <AddKeyForm onClose={onClose} />
    </Modal>
  );
}

function AddKeyForm({ onClose }: { onClose: () => void }) {
  const { t, user, actions } = useVault();
  const [form, setForm] = React.useState({ ...EMPTY_FORM, model: AI_PROVIDER_META.GEMINI.models[0].id });
  const [reveal, setReveal] = React.useState(false);
  const [errors, setErrors] = React.useState<Partial<Record<keyof typeof EMPTY_FORM | "form", string>>>({});
  const [busy, setBusy] = React.useState(false);
  const id = React.useId();
  const meta = AI_PROVIDER_META[form.provider];

  const set = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) => setForm((f) => ({ ...f, [key]: value }));

  function changeProvider(provider: AiProvider) {
    setForm((f) => ({ ...f, provider, model: AI_PROVIDER_META[provider].models[0]?.id ?? "", visionModel: "" }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!form.label.trim()) next.label = t.vault.labelRequired;
    if (form.apiKey.trim().length < 8) next.apiKey = t.vault.keyTooShort;
    if (meta.requiresBaseUrl && !form.baseUrl.trim()) next.baseUrl = t.vault.baseUrlRequired;
    if (!form.model.trim()) next.model = t.vault.modelRequired;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      const res = await fetch("/api/vault/encrypt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: user.id, provider: form.provider, apiKey: form.apiKey }),
      });
      if (!res.ok) throw new Error("ENCRYPT");
      const enc = (await res.json()) as { encryptedKey: string; encryptionKeyId: string; keyHint: string };
      await actions.createApiKey({
        provider: form.provider,
        label: form.label,
        encryptedKey: enc.encryptedKey,
        encryptionKeyId: enc.encryptionKeyId,
        keyHint: enc.keyHint,
        baseUrl: form.baseUrl.trim() || null,
        defaultModel: form.model.trim(),
        visionModel: form.visionModel.trim() || null,
        aiOutputLanguage: form.language === "" ? null : form.language,
      });
      setForm(EMPTY_FORM); // drop the plaintext key from memory immediately
      onClose();
    } catch (err) {
      const message = err instanceof Error && err.message === "DUPLICATE_LABEL" ? { label: t.vault.duplicateLabel } : { form: err instanceof Error && err.message === "ENCRYPT" ? t.vault.encryptFailed : t.common.errorGeneric };
      setErrors(message);
      setBusy(false);
    }
  }

  return (
      <form onSubmit={submit} className="space-y-4" noValidate autoComplete="off">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.vault.provider} htmlFor={`${id}-provider`}>
            <Select id={`${id}-provider`} value={form.provider} onChange={(e) => changeProvider(e.target.value as AiProvider)}>
              {AI_PROVIDERS.map((p) => <option key={p} value={p}>{AI_PROVIDER_META[p].label}</option>)}
            </Select>
          </Field>
          <Field label={t.vault.label} htmlFor={`${id}-label`} error={errors.label}>
            <Input id={`${id}-label`} value={form.label} onChange={(e) => set("label", e.target.value)} placeholder={t.vault.labelPlaceholder} maxLength={60} aria-invalid={errors.label ? true : undefined} />
          </Field>
        </div>
        <Field label={t.vault.apiKey} htmlFor={`${id}-key`} error={errors.apiKey}>
          <div className="relative">
            <Input id={`${id}-key`} type={reveal ? "text" : "password"} value={form.apiKey} onChange={(e) => set("apiKey", e.target.value)} placeholder={t.vault.apiKeyPlaceholder} autoComplete="off" spellCheck={false} className="metric pr-10" aria-invalid={errors.apiKey ? true : undefined} />
            <button type="button" onClick={() => setReveal((v) => !v)} aria-label={reveal ? t.vault.hide : t.vault.show} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
              {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        {meta.requiresBaseUrl && (
          <Field label={t.vault.baseUrl} htmlFor={`${id}-base`} hint={t.vault.baseUrlHint} error={errors.baseUrl}>
            <Input id={`${id}-base`} type="url" value={form.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} placeholder="https://api.example.com/v1" className="metric" />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={meta.requiresBaseUrl ? t.vault.modelCustom : t.vault.model} htmlFor={`${id}-model`} hint={t.vault.modelHint} error={errors.model}>
            {meta.requiresBaseUrl ? (
              <Input id={`${id}-model`} value={form.model} onChange={(e) => set("model", e.target.value)} className="metric" />
            ) : (
              <Select id={`${id}-model`} value={form.model} onChange={(e) => set("model", e.target.value)}>
                {meta.models.map((m) => <option key={m.id} value={m.id}>{m.label} · {m.tier === "LIGHT" ? t.vault.tierLight : t.vault.tierHeavy}</option>)}
              </Select>
            )}
          </Field>
          <Field label={t.vault.visionModel} htmlFor={`${id}-vision`} hint={t.vault.visionModelHint}>
            {meta.requiresBaseUrl ? (
              <Input id={`${id}-vision`} value={form.visionModel} onChange={(e) => set("visionModel", e.target.value)} className="metric" />
            ) : (
              <Select id={`${id}-vision`} value={form.visionModel} onChange={(e) => set("visionModel", e.target.value)}>
                <option value="">{t.common.none}</option>
                {meta.models.filter((m) => m.vision).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label={t.vault.aiLanguage} htmlFor={`${id}-lang`}>
          <Select id={`${id}-lang`} value={form.language} onChange={(e) => set("language", e.target.value as Language | "")}>
            <option value="VI">{t.vault.aiLanguageVI}</option>
            <option value="EN">{t.vault.aiLanguageEN}</option>
            <option value="">{t.vault.aiLanguageFollow}</option>
          </Select>
        </Field>
        {errors.form && <p role="alert" className="text-sm text-destructive">{errors.form}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="lg" onClick={onClose}>{t.common.cancel}</Button>
          <Button type="submit" size="lg" disabled={busy}>{busy ? <><Loader2 className="animate-spin" />{t.common.saving}</> : <><ShieldCheck />{t.common.save}</>}</Button>
        </div>
      </form>
  );
}

type TestState = { status: "idle" | "running" | "ok" | "fail"; message?: string };

function KeyCard({ apiKey }: { apiKey: UserApiKey }) {
  const { t, actions, locale, user } = useVault();
  const [test, setTest] = React.useState<TestState>({ status: "idle" });
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const meta = AI_PROVIDER_META[apiKey.provider];
  const model = meta.models.find((m) => m.id === apiKey.defaultModel);
  const errors = t.vault.errors as Record<string, string>;
  const isDemo = apiKey.label.endsWith("(demo)");

  async function runTest() {
    setTest({ status: "running" });
    try {
      const res = await fetch("/api/ai/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credential: { userId: user.id, provider: apiKey.provider, encryptedKey: apiKey.encryptedKey, baseUrl: apiKey.baseUrl, defaultModel: apiKey.defaultModel, visionModel: apiKey.visionModel } }),
      });
      const body = (await res.json()) as { ok?: boolean; model?: string; error?: string; message?: string };
      if (res.ok && body.ok) {
        setTest({ status: "ok", message: format(t.vault.testOk, { model: body.model ?? "" }) });
        await actions.updateApiKey(apiKey.id, { lastValidatedAt: new Date(), lastUsedAt: new Date(), lastErrorMessage: null });
      } else {
        const label = errors[body.error ?? "UNKNOWN"] ?? errors.UNKNOWN;
        setTest({ status: "fail", message: `${label}${body.error === "PROVIDER_HTTP" && body.message ? ` — ${body.message}` : ""}` });
        await actions.updateApiKey(apiKey.id, { lastErrorMessage: body.error ?? "UNKNOWN" });
      }
    } catch {
      setTest({ status: "fail", message: errors.NETWORK });
    }
  }

  const when = apiKey.lastValidatedAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(apiKey.lastValidatedAt) : t.vault.never;

  return (
    <CrosshairCard className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <KeyRound className="size-4 text-primary" aria-hidden />
            <h3 className="text-sm font-semibold">{apiKey.label}</h3>
            {apiKey.isDefault && <Badge><Star data-icon="inline-start" />{t.vault.isDefault}</Badge>}
            <Badge variant={apiKey.isActive ? "secondary" : "outline"}>{apiKey.isActive ? t.vault.active : t.vault.inactive}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{meta.label} · <span className="metric">{model?.label ?? apiKey.defaultModel}</span>{model && <> · {model.tier === "LIGHT" ? t.vault.tierLight : t.vault.tierHeavy}</>}</p>
        </div>
        <code className="metric rounded-md border border-border bg-muted/50 px-2 py-1 text-xs" aria-label={`…${apiKey.keyHint}`}>••••••••{apiKey.keyHint}</code>
      </div>
      <dl className="grid gap-2 text-xs sm:grid-cols-3">
        <div><dt className="text-muted-foreground">{t.vault.aiLanguage}</dt><dd className="font-medium">{apiKey.aiOutputLanguage ? t.language[apiKey.aiOutputLanguage] : t.vault.aiLanguageFollow}</dd></div>
        <div><dt className="text-muted-foreground">{t.vault.lastValidated}</dt><dd className="metric font-medium">{when}</dd></div>
        {apiKey.baseUrl && <div className="min-w-0"><dt className="text-muted-foreground">{t.vault.baseUrl}</dt><dd className="metric truncate font-medium">{apiKey.baseUrl}</dd></div>}
      </dl>
      {isDemo && <p className="text-xs text-muted-foreground">{t.vault.demoNote}</p>}
      <div aria-live="polite" className="min-h-5 text-xs">
        {test.status === "running" && <span className="text-muted-foreground">{t.vault.testing}</span>}
        {test.status === "ok" && <span className="text-emerald-500">{test.message}</span>}
        {test.status === "fail" && <span className="text-destructive">{t.vault.testFail}: {test.message}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="lg" onClick={runTest} disabled={test.status === "running"}>{test.status === "running" ? <Loader2 className="animate-spin" /> : <Zap />}{t.vault.test}</Button>
        {!apiKey.isDefault && <Button variant="ghost" size="lg" onClick={() => void actions.updateApiKey(apiKey.id, { isDefault: true })}><Star />{t.vault.makeDefault}</Button>}
        <Button variant="ghost" size="lg" onClick={() => void actions.updateApiKey(apiKey.id, { isActive: !apiKey.isActive })}>{apiKey.isActive ? t.vault.inactive : t.vault.active}</Button>
        <Button variant="destructive" size="lg" className="ml-auto" onClick={() => setConfirmDelete(true)}><Trash2 />{t.common.delete}</Button>
      </div>
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title={t.vault.deleteTitle} description={t.vault.deleteBody}>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="lg" onClick={() => setConfirmDelete(false)}>{t.common.cancel}</Button>
          <Button variant="destructive" size="lg" onClick={() => { setConfirmDelete(false); void actions.deleteApiKey(apiKey.id); }}>{t.common.confirmDelete}</Button>
        </div>
      </Modal>
    </CrosshairCard>
  );
}

export function ApiVault() {
  const { snapshot, t } = useVault();
  const [adding, setAdding] = React.useState(false);

  return (
    <section id="vault" aria-labelledby="vault-title" className="scroll-mt-24 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 id="vault-title" className="text-lg font-semibold tracking-tight">{t.vault.title}</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">{t.vault.subtitle}</p>
          <p className="text-xs text-muted-foreground">{t.vault.tiers}</p>
        </div>
        <Button size="lg" onClick={() => setAdding(true)}><Plus />{t.vault.add}</Button>
      </div>
      {snapshot.apiKeys.length === 0 ? (
        <CrosshairCard className="space-y-2 py-12 text-center">
          <KeyRound className="mx-auto size-7 text-muted-foreground" aria-hidden />
          <p className="font-medium">{t.vault.empty}</p>
          <p className="text-sm text-muted-foreground">{t.vault.emptyBody}</p>
        </CrosshairCard>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">{snapshot.apiKeys.map((k) => <li key={k.id}><KeyCard apiKey={k} /></li>)}</ul>
      )}
      <AddKeyDialog open={adding} onClose={() => setAdding(false)} />
    </section>
  );
}
