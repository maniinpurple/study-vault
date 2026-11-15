"use client";

import { Eye, EyeOff, Loader2, Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { ActionError, useVault } from "@/components/app-provider";
import { CrosshairCard } from "@/components/crosshair-card";
import { Modal } from "@/components/modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { AI_PROVIDER_META, AI_PROVIDERS, normalizeModelId, type AiProvider, type Language } from "@/lib/constants";
import { format } from "@/lib/i18n";
import type { UserApiKey } from "@/lib/repo/types";

const EMPTY_FORM = { provider: "GEMINI" as AiProvider, label: "", apiKey: "", baseUrl: "", model: "", visionModel: "", language: "" as Language | "" };

function AddKeyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useVault();
  return (
    <Modal open={open} onClose={onClose} title={t.keys.add} description={t.keys.apiKeyNote}>
      {/* <Modal> mounts its children only while open, so the form (and the plaintext key) resets on every open. */}
      <AddKeyForm onClose={onClose} />
    </Modal>
  );
}

function AddKeyForm({ onClose }: { onClose: () => void }) {
  const { t, actions } = useVault();
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
    if (!form.label.trim()) next.label = t.keys.labelRequired;
    if (form.apiKey.trim().length < 8) next.apiKey = t.keys.keyTooShort;
    if (meta.requiresBaseUrl && !form.baseUrl.trim()) next.baseUrl = t.keys.baseUrlRequired;
    if (!form.model.trim()) next.model = t.keys.modelRequired;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setBusy(true);
    try {
      // The plaintext key is sent once, to a server action that encrypts it before it is stored.
      const created = await actions.createApiKey({
        provider: form.provider,
        label: form.label,
        apiKey: form.apiKey,
        baseUrl: form.baseUrl.trim() || null,
        defaultModel: form.model.trim(),
        visionModel: form.visionModel.trim() || null,
        aiOutputLanguage: form.language === "" ? null : form.language,
      });
      setForm(EMPTY_FORM); // drop the plaintext key from memory immediately
      onClose();
      // Check the new key right away, using the id the server just returned for it (never an id from earlier state).
      void requestKeyTest(created.id).then((outcome) => recordKeyTest(actions, created.id, outcome));
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      const message = code === "DUPLICATE_LABEL" ? { label: t.keys.duplicateLabel } : { form: code === "ENCRYPT" ? t.keys.encryptFailed : t.common.errorGeneric };
      setErrors(message);
      setBusy(false);
    }
  }

  return (
      <form onSubmit={submit} className="space-y-4" noValidate autoComplete="off">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t.keys.provider} htmlFor={`${id}-provider`}>
            <Select id={`${id}-provider`} value={form.provider} onChange={(e) => changeProvider(e.target.value as AiProvider)}>
              {AI_PROVIDERS.map((p) => <option key={p} value={p}>{AI_PROVIDER_META[p].label}</option>)}
            </Select>
          </Field>
          <Field label={t.keys.label} htmlFor={`${id}-label`} error={errors.label}>
            <Input id={`${id}-label`} value={form.label} onChange={(e) => set("label", e.target.value)} placeholder={t.keys.labelPlaceholder} maxLength={60} aria-invalid={errors.label ? true : undefined} />
          </Field>
        </div>
        <Field label={t.keys.apiKey} htmlFor={`${id}-key`} error={errors.apiKey}>
          <div className="relative">
            <Input id={`${id}-key`} type={reveal ? "text" : "password"} value={form.apiKey} onChange={(e) => set("apiKey", e.target.value)} placeholder={t.keys.apiKeyPlaceholder} autoComplete="off" spellCheck={false} className="tabular-nums pr-10" aria-invalid={errors.apiKey ? true : undefined} />
            <button type="button" onClick={() => setReveal((v) => !v)} aria-label={reveal ? t.keys.hide : t.keys.show} className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground">
              {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        {meta.requiresBaseUrl && (
          <Field label={t.keys.baseUrl} htmlFor={`${id}-base`} hint={t.keys.baseUrlHint} error={errors.baseUrl}>
            <Input id={`${id}-base`} type="url" value={form.baseUrl} onChange={(e) => set("baseUrl", e.target.value)} placeholder="https://api.example.com/v1" className="tabular-nums" />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={meta.requiresBaseUrl ? t.keys.modelCustom : t.keys.model} htmlFor={`${id}-model`} hint={t.keys.modelHint} error={errors.model}>
            {meta.requiresBaseUrl ? (
              <Input id={`${id}-model`} value={form.model} onChange={(e) => set("model", e.target.value)} className="tabular-nums" />
            ) : (
              <Select id={`${id}-model`} value={form.model} onChange={(e) => set("model", e.target.value)}>
                {meta.models.map((m) => <option key={m.id} value={m.id}>{m.label} · {m.tier === "LIGHT" ? t.keys.tierLight : t.keys.tierHeavy}</option>)}
              </Select>
            )}
          </Field>
          <Field label={t.keys.visionModel} htmlFor={`${id}-vision`} hint={t.keys.visionModelHint}>
            {meta.requiresBaseUrl ? (
              <Input id={`${id}-vision`} value={form.visionModel} onChange={(e) => set("visionModel", e.target.value)} className="tabular-nums" />
            ) : (
              <Select id={`${id}-vision`} value={form.visionModel} onChange={(e) => set("visionModel", e.target.value)}>
                <option value="">{t.common.none}</option>
                {meta.models.filter((m) => m.vision).map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label={t.keys.aiLanguage} htmlFor={`${id}-lang`}>
          <Select id={`${id}-lang`} value={form.language} onChange={(e) => set("language", e.target.value as Language | "")}>
            <option value="VI">{t.keys.aiLanguageVI}</option>
            <option value="EN">{t.keys.aiLanguageEN}</option>
            <option value="">{t.keys.aiLanguageFollow}</option>
          </Select>
        </Field>
        {errors.form && <p role="alert" className="text-sm text-destructive">{errors.form}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" size="lg" onClick={onClose}>{t.common.cancel}</Button>
          <Button type="submit" size="lg" disabled={busy}>{busy ? <><Loader2 className="animate-spin" />{t.common.saving}</> : <>{t.common.save}</>}</Button>
        </div>
      </form>
  );
}

type Actions = ReturnType<typeof useVault>["actions"];
type TestOutcome = { ok: true; model: string } | { ok: false; error: string; message?: string };

/** Ask the server to run one tiny completion with the key `keyId`. Never throws: every failure is an outcome. */
async function requestKeyTest(keyId: string, signal?: AbortSignal): Promise<TestOutcome> {
  try {
    const res = await fetch("/api/ai/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keyId }), signal });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; model?: string; error?: string; message?: string } | null;
    if (res.ok && body?.ok) return { ok: true, model: body.model ?? "" };
    return { ok: false, error: body?.error ?? "UNKNOWN", message: body?.message };
  } catch {
    return { ok: false, error: "NETWORK" };
  }
}

/**
 * Record a test result on the key it belongs to. The id is the one the test was started with, and the write is skipped
 * (or its "not found" ignored) when that key has been deleted in the meantime — a result must never be written to a key
 * that no longer exists, nor to a different one.
 */
async function recordKeyTest(actions: Actions, keyId: string, outcome: TestOutcome, stillExists: () => boolean = () => true): Promise<void> {
  if (!stillExists()) return;
  const patch = outcome.ok ? { lastValidatedAt: new Date(), lastUsedAt: new Date(), lastErrorMessage: null } : { lastErrorMessage: outcome.error };
  try {
    await actions.updateApiKey(keyId, patch);
  } catch (err) {
    if (!(err instanceof ActionError && err.code === "NOT_FOUND")) console.error("[vaultlearn] could not record the key test", err);
  }
}

type TestState = { status: "idle" | "running" | "ok" | "fail"; message?: string };

function KeyCard({ apiKey }: { apiKey: UserApiKey }) {
  const { snapshot, t, actions, locale } = useVault();
  const [test, setTest] = React.useState<TestState>({ status: "idle" });
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const meta = AI_PROVIDER_META[apiKey.provider];
  const model = meta.models.find((m) => m.id === (apiKey.defaultModel ? normalizeModelId(apiKey.defaultModel) : null));
  const errors = t.keys.errors as Record<string, string>;
  const abortRef = React.useRef<AbortController | null>(null);
  // Always the CURRENT list of keys, read when a test finishes (a closure would hold the list from when it started).
  const liveKeyIds = React.useRef(new Set<string>());
  React.useEffect(() => {
    liveKeyIds.current = new Set(snapshot.apiKeys.map((k) => k.id));
  });
  // A test still running when this card goes away (the key was deleted) is cancelled and its result discarded.
  React.useEffect(() => {
    const abort = abortRef;
    return () => abort.current?.abort();
  }, []);

  async function runTest() {
    const keyId = apiKey.id; // fixed for this run
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setTest({ status: "running" });
    const outcome = await requestKeyTest(keyId, controller.signal);
    if (controller.signal.aborted) return;
    setTest(outcome.ok ? { status: "ok", message: format(t.keys.testOk, { model: outcome.model }) } : { status: "fail", message: `${errors[outcome.error] ?? errors.UNKNOWN}${outcome.error === "PROVIDER_HTTP" && outcome.message ? ` — ${outcome.message}` : ""}` });
    await recordKeyTest(actions, keyId, outcome, () => liveKeyIds.current.has(keyId));
  }

  const when = apiKey.lastValidatedAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(apiKey.lastValidatedAt) : t.keys.never;

  return (
    <CrosshairCard className="space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-heading">{apiKey.label}</h3>
            {apiKey.isDefault && <Badge>{t.keys.isDefault}</Badge>}
            <Badge variant={apiKey.isActive ? "secondary" : "outline"}>{apiKey.isActive ? t.keys.active : t.keys.inactive}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{meta.label} · <span className="tabular-nums">{model?.label ?? apiKey.defaultModel}</span>{model && <> · {model.tier === "LIGHT" ? t.keys.tierLight : t.keys.tierHeavy}</>}</p>
        </div>
        <code className="tabular-nums rounded-md border border-border bg-muted/50 px-2 py-1 text-xs" aria-label={`…${apiKey.keyHint}`}>••••••••{apiKey.keyHint}</code>
      </div>
      <dl className="grid gap-2 text-xs sm:grid-cols-3">
        <div><dt className="text-muted-foreground">{t.keys.aiLanguage}</dt><dd className="font-medium">{apiKey.aiOutputLanguage ? t.language[apiKey.aiOutputLanguage] : t.keys.aiLanguageFollow}</dd></div>
        <div><dt className="text-muted-foreground">{t.keys.lastValidated}</dt><dd className="tabular-nums font-medium">{when}</dd></div>
        {apiKey.baseUrl && <div className="min-w-0"><dt className="text-muted-foreground">{t.keys.baseUrl}</dt><dd className="tabular-nums truncate font-medium">{apiKey.baseUrl}</dd></div>}
      </dl>
      <div aria-live="polite" className="min-h-5 text-xs">
        {test.status === "running" && <span className="text-muted-foreground">{t.keys.testing}</span>}
        {test.status === "ok" && <span className="text-success">{test.message}</span>}
        {test.status === "fail" && <span className="text-destructive">{t.keys.testFail}: {test.message}</span>}
        {test.status === "idle" && apiKey.lastErrorMessage && <span className="text-destructive">{t.keys.testFail}: {errors[apiKey.lastErrorMessage] ?? errors.UNKNOWN}</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="lg" onClick={runTest} disabled={test.status === "running"}>{test.status === "running" ? <Loader2 className="animate-spin" /> : null}{t.keys.test}</Button>
        {!apiKey.isDefault && <Button variant="ghost" size="lg" onClick={() => void actions.updateApiKey(apiKey.id, { isDefault: true })}>{t.keys.makeDefault}</Button>}
        <Button variant="ghost" size="lg" onClick={() => void actions.updateApiKey(apiKey.id, { isActive: !apiKey.isActive })}>{apiKey.isActive ? t.keys.inactive : t.keys.active}</Button>
        <Button variant="destructive" size="lg" className="ml-auto" onClick={() => setConfirmDelete(true)}><Trash2 />{t.common.delete}</Button>
      </div>
      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title={t.keys.deleteTitle} description={t.keys.deleteBody}>
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
          <h2 id="vault-title" className="text-title">{t.keys.title}</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">{t.keys.subtitle}</p>
          <p className="text-xs text-muted-foreground">{t.keys.tiers}</p>
        </div>
        <Button size="lg" onClick={() => setAdding(true)}><Plus />{t.keys.add}</Button>
      </div>
      {snapshot.apiKeys.length === 0 ? (
        <CrosshairCard className="space-y-2 py-12 text-center">
          <p className="font-medium">{t.keys.empty}</p>
          <p className="text-sm text-muted-foreground">{t.keys.emptyBody}</p>
        </CrosshairCard>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">{snapshot.apiKeys.map((k) => <li key={k.id}><KeyCard apiKey={k} /></li>)}</ul>
      )}
      <AddKeyDialog open={adding} onClose={() => setAdding(false)} />
    </section>
  );
}
