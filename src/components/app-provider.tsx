"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { DEFAULT_THEME, STORAGE_KEYS, THEME_ATTRIBUTE, type Language, type TagDeclineReason, type ThemePreference } from "@/lib/constants";
import type { MemorySyncResponse } from "@/lib/brain-prompt";
import { getDictionary, LOCALE_TAG, type Dictionary } from "@/lib/i18n";
import type {
  AdaptiveTag, AiSynthesizedProblem, ApiKeyPatch, CardAttemptLog, CardPatch, ExamPrepSession, ExamUpload, MistakeCard, NewApiKey, NewExamPrepSession, NewExamUpload, NewProblem,
  NewSubject, NewSynthesizedProblem, NewTagSuggestion, PersonaPatch, ReviewInput, Subject, SubjectMemoryInput, SubjectPatch, SynthesizedProblemPatch, TagSuggestionFeedback, Topic,
  UploadPatch, UserApiKey, UserSnapshot,
} from "@/lib/repo/types";
import { patchCard, patchUpload, patchUser, removeCard, setCardTagLinks } from "@/lib/optimistic";
import { shareStructure } from "@/lib/snapshot-share";
import * as server from "@/server/actions";
import type { ActionResult } from "@/server/result";

type Status = "loading" | "ready" | "error";

interface Actions {
  setTheme(theme: ThemePreference): Promise<void>;
  setUiLanguage(language: Language): Promise<void>;
  setDefaultAiLanguage(language: Language): Promise<void>;
  setActiveSubject(id: string | null): void;
  createSubject(input: NewSubject): Promise<Subject>;
  updateSubject(id: string, patch: SubjectPatch): Promise<void>;
  deleteSubject(id: string): Promise<void>;
  createTopic(input: { subjectId: string; name: string; parentId?: string | null }): Promise<Topic>;
  renameTopic(id: string, name: string): Promise<void>;
  deleteTopic(id: string): Promise<void>;
  createApiKey(input: NewApiKey): Promise<UserApiKey>;
  updateApiKey(id: string, patch: ApiKeyPatch): Promise<void>;
  deleteApiKey(id: string): Promise<void>;
  createSource(input: NewExamUpload): Promise<ExamUpload>;
  updateSource(id: string, patch: UploadPatch): Promise<void>;
  deleteSource(id: string): Promise<void>;
  /** Save a problem (snipped or standalone). Never needs an AI key. */
  createProblem(input: NewProblem): Promise<MistakeCard>;
  deleteProblem(id: string): Promise<void>;
  /** A stored image/file by the path kept on a card or upload (null when missing). Served only to its owner. */
  getBlob(path: string): Promise<Blob | null>;

  reviewCard(input: ReviewInput): Promise<{ card: MistakeCard; log: CardAttemptLog }>;
  updateCard(id: string, patch: CardPatch): Promise<void>;
  setCardTags(cardId: string, tagIds: string[]): Promise<void>;
  saveSubjectMemory(subjectId: string, input: SubjectMemoryInput): Promise<void>;
  updatePersona(patch: PersonaPatch): Promise<void>;
  /** Persist one "Update memory" result: subject memory + persona + any tag suggestions. */
  applyMemorySync(subjectId: string, result: MemorySyncResponse, meta: { sourceCardCount: number; sourceAttemptCount: number; suggestionMeta: Pick<NewTagSuggestion, "aiProvider" | "aiModel" | "outputLanguage"> }): Promise<TagSuggestionFeedback[]>;
  addTagSuggestions(subjectId: string, suggestions: NewTagSuggestion[]): Promise<TagSuggestionFeedback[]>;
  acceptTagSuggestion(id: string): Promise<AdaptiveTag>;
  rejectTagSuggestion(id: string, reason: TagDeclineReason, detail?: string | null): Promise<void>;
  createExamPrepSession(input: NewExamPrepSession): Promise<ExamPrepSession>;
  deleteExamPrepSession(id: string): Promise<void>;
  saveSynthesizedProblem(input: NewSynthesizedProblem): Promise<AiSynthesizedProblem>;
  updateSynthesizedProblem(id: string, patch: SynthesizedProblemPatch): Promise<void>;
  promoteSynthesizedProblem(id: string): Promise<MistakeCard>;
  deleteSynthesizedProblem(id: string): Promise<void>;
}

interface AppState {
  status: Status;
  snapshot: UserSnapshot | null;
  /** Time the snapshot was loaded; used by stats so render stays pure. */
  loadedAt: Date;
  activeSubjectId: string | null;
  t: Dictionary;
  locale: string;
  actions: Actions;
}

const AppContext = React.createContext<AppState | null>(null);
/**
 * The two parts of the app state that almost never change, as their own contexts: components that only need the actions or the
 * dictionary subscribe to these and are not re-rendered by every snapshot update (which replaces the main context's value).
 */
const ActionsContext = React.createContext<Actions | null>(null);
const I18nContext = React.createContext<{ t: Dictionary; locale: string } | null>(null);

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode) */
  }
}

/** Error carrying the stable code a data action returned (`UNAUTHENTICATED`, `DUPLICATE_LABEL`, `NOT_FOUND`, …). */
export class ActionError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ActionError";
  }
}

const fileUrl = (path: string) => `/api/files/${path.split("/").map(encodeURIComponent).join("/")}`;

/**
 * Holds the signed-in user's data. Everything comes from, and goes to, the server: reads and writes are server
 * actions that scope every query by the session's user id, and each mutation returns the user's fresh snapshot.
 */
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<Status>("loading");
  const [snapshot, setSnapshot] = React.useState<UserSnapshot | null>(null);
  const [loadedAt, setLoadedAt] = React.useState(() => new Date(0));
  const [activeSubjectId, setActiveSubjectIdState] = React.useState<string | null>(null);
  const userIdRef = React.useRef<string | null>(null);
  /** The latest snapshot, readable synchronously: optimistic edits and rollbacks are computed from it. */
  const snapshotRef = React.useRef<UserSnapshot | null>(null);
  /** Data actions currently waiting for the server. Only the last response is applied (see `call`). */
  const inflight = React.useRef(0);
  const router = useRouter();
  /** Session gone (expired, or the account was removed): back to the sign-in page. */
  const toLogin = React.useCallback(() => router.replace("/login"), [router]);

  /** Show `next` now (an optimistic edit, a rollback, or the server's snapshot). */
  const commit = React.useCallback((next: UserSnapshot) => {
    if (snapshotRef.current === next) return;
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const apply = React.useCallback((incoming: UserSnapshot) => {
    // The server sends a complete, freshly deserialized snapshot: re-use every object that did not change, so memoized
    // components keep their identity and skip the render.
    const snap = shareStructure(snapshotRef.current, incoming);
    const changed = snap !== snapshotRef.current;
    userIdRef.current = snap.user.id;
    commit(snap);
    // `loadedAt` anchors "due today": refresh it when data changed, or when it has gone stale.
    setLoadedAt((previous) => (changed || Date.now() - previous.getTime() > 60_000 ? new Date() : previous));
    setActiveSubjectIdState((current) => {
      const stored = current ?? readStorage(`${STORAGE_KEYS.activeSubject}:${snap.user.id}`);
      return snap.subjects.some((s) => s.id === stored && s.archivedAt === null) ? stored : null;
    });
  }, [commit]);

  /**
   * Await a data action: hand back its result and turn a failure into an `ActionError`.
   *
   * With `optimistic`, the UI changes right now instead of after the server round trip (which also reloads the whole snapshot);
   * if the action then fails, the previous snapshot is put back and the server's version is fetched.
   * Server actions run one after another, so a response that arrives while others are still waiting describes a state the UI has
   * already moved past: only the last response is applied, and it already contains everything before it.
   */
  const call = React.useCallback(
    async <T,>(pending: Promise<ActionResult<T>>, optimistic?: { before: UserSnapshot | null }): Promise<T> => {
      inflight.current += 1;
      let result: ActionResult<T>;
      try {
        result = await pending;
      } finally {
        inflight.current -= 1;
      }
      if (!result.ok) {
        if (optimistic?.before) {
          commit(optimistic.before);
          void server.loadSnapshotAction().then((fresh) => fresh.ok && apply(fresh.snapshot));
        }
        if (result.code === "UNAUTHENTICATED") toLogin();
        throw new ActionError(result.code);
      }
      if (inflight.current === 0) apply(result.snapshot);
      return result.data;
    },
    [apply, commit, toLogin],
  );

  /** Run a data action, optionally after showing its expected effect (`edit`) immediately. */
  const act = React.useCallback(
    <T,>(start: () => Promise<ActionResult<T>>, edit?: (snapshot: UserSnapshot) => UserSnapshot): Promise<T> => {
      const before = snapshotRef.current;
      if (edit && before) commit(edit(before));
      return call(start(), edit ? { before } : undefined);
    },
    [call, commit],
  );

  React.useEffect(() => {
    let cancelled = false;
    server
      .loadSnapshotAction()
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          if (result.code === "UNAUTHENTICATED") return toLogin();
          return setStatus("error");
        }
        apply(result.snapshot);
        setStatus("ready");
      })
      .catch((err) => {
        console.error("[vaultlearn] failed to load your data", err);
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [apply, toLogin]);

  const user = snapshot?.user ?? null;
  const uiLanguage: Language = user?.uiLanguage ?? "VI";
  const theme: ThemePreference = user?.theme ?? DEFAULT_THEME;

  // Reflect the account's prefs on <html> and mirror them for the pre-hydration script (no flash on reload).
  React.useEffect(() => {
    const root = document.documentElement;
    root.dataset.mode = THEME_ATTRIBUTE[theme];
    root.lang = LOCALE_TAG[uiLanguage].split("-")[0];
    writeStorage(STORAGE_KEYS.prefs, JSON.stringify({ theme: THEME_ATTRIBUTE[theme], lang: root.lang }));
  }, [theme, uiLanguage]);

  const actions = React.useMemo<Actions>(() => {
    const rememberSubject = (id: string | null) => {
      if (userIdRef.current) writeStorage(`${STORAGE_KEYS.activeSubject}:${userIdRef.current}`, id);
    };
    return {
      async setTheme(next) {
        await act(() => server.updateProfileAction({ theme: next }), (s) => patchUser(s, { theme: next }));
      },
      async setUiLanguage(next) {
        await act(() => server.updateProfileAction({ uiLanguage: next }), (s) => patchUser(s, { uiLanguage: next }));
      },
      async setDefaultAiLanguage(next) {
        await act(() => server.updateProfileAction({ defaultAiOutputLanguage: next }), (s) => patchUser(s, { defaultAiOutputLanguage: next }));
      },
      setActiveSubject(id) {
        setActiveSubjectIdState(id);
        rememberSubject(id);
      },
      async createSubject(input) {
        const created = await call(server.createSubjectAction(input));
        setActiveSubjectIdState(created.id);
        rememberSubject(created.id);
        return created;
      },
      async updateSubject(id, patch) {
        await call(server.updateSubjectAction(id, patch));
      },
      async deleteSubject(id) {
        await call(server.deleteSubjectAction(id));
        setActiveSubjectIdState((current) => (current === id ? null : current));
        rememberSubject(null);
      },
      createTopic: (input) => call(server.createTopicAction(input)),
      async renameTopic(id, name) {
        await call(server.renameTopicAction(id, name));
      },
      async deleteTopic(id) {
        await call(server.deleteTopicAction(id));
      },
      createApiKey: (input) => call(server.createApiKeyAction(input)),
      async updateApiKey(id, patch) {
        await call(server.updateApiKeyAction(id, patch));
      },
      async deleteApiKey(id) {
        await call(server.deleteApiKeyAction(id));
      },

      async createSource(input) {
        const body = new FormData();
        const { files, thumbnail, ...meta } = input;
        body.set("meta", JSON.stringify({ title: meta.title, subjectId: meta.subjectId ?? null, completed: meta.completed ?? false, deadline: meta.deadline ?? null, fileKind: meta.fileKind, pageCount: meta.pageCount }));
        files.forEach((file, i) => body.append("files", file, file instanceof File ? file.name : `page-${i + 1}`));
        if (thumbnail) body.set("thumbnail", thumbnail, "thumbnail.jpg");
        const res = await fetch("/api/sources", { method: "POST", body });
        const reply = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
        if (res.status === 401) toLogin();
        if (!res.ok || !reply?.id) throw new ActionError(reply?.error ?? "INTERNAL");
        const loaded = await server.loadSnapshotAction();
        if (!loaded.ok) throw new ActionError(loaded.code);
        apply(loaded.snapshot);
        const created = loaded.snapshot.examUploads.find((u) => u.id === reply.id);
        if (!created) throw new ActionError("NOT_FOUND");
        return created;
      },
      async updateSource(id, patch) {
        await act(() => server.updateSourceAction(id, patch), (s) => patchUpload(s, id, patch));
      },
      async deleteSource(id) {
        await call(server.deleteSourceAction(id));
      },
      createProblem(input) {
        const { originalCrop, diagramImage, ...meta } = input;
        const body = new FormData();
        body.set("meta", JSON.stringify(meta));
        if (originalCrop) body.set("originalCrop", originalCrop, "original.jpg");
        if (diagramImage) body.set("diagramImage", diagramImage, "diagram.png");
        return call(server.createProblemAction(body));
      },
      async deleteProblem(id) {
        await act(() => server.deleteProblemAction(id), (s) => removeCard(s, id));
      },
      async getBlob(path) {
        try {
          const res = await fetch(fileUrl(path));
          return res.ok ? await res.blob() : null;
        } catch {
          return null;
        }
      },

      reviewCard: (input) => call(server.reviewCardAction(input)),
      async updateCard(id, patch) {
        await act(() => server.updateCardAction(id, patch), (s) => patchCard(s, id, patch));
      },
      async setCardTags(cardId, tagIds) {
        await act(() => server.setCardTagsAction(cardId, tagIds), (s) => setCardTagLinks(s, cardId, tagIds));
      },
      async saveSubjectMemory(subjectId, input) {
        await call(server.saveSubjectMemoryAction(subjectId, input));
      },
      async updatePersona(patch) {
        await call(server.updatePersonaAction(patch));
      },
      applyMemorySync: (subjectId, result, meta) => call(server.applyMemorySyncAction(subjectId, result, meta)),
      addTagSuggestions: (subjectId, suggestions) => call(server.addTagSuggestionsAction(subjectId, suggestions)),
      acceptTagSuggestion: (id) => call(server.acceptTagSuggestionAction(id)),
      async rejectTagSuggestion(id, reason, detail) {
        await call(server.rejectTagSuggestionAction(id, reason, detail));
      },
      createExamPrepSession: (input) => call(server.createExamPrepSessionAction(input)),
      async deleteExamPrepSession(id) {
        await call(server.deleteExamPrepSessionAction(id));
      },
      saveSynthesizedProblem: (input) => call(server.saveSynthesizedProblemAction(input)),
      async updateSynthesizedProblem(id, patch) {
        await call(server.updateSynthesizedProblemAction(id, patch));
      },
      promoteSynthesizedProblem: (id) => call(server.promoteSynthesizedProblemAction(id)),
      async deleteSynthesizedProblem(id) {
        await call(server.deleteSynthesizedProblemAction(id));
      },
    };
  }, [act, apply, call, toLogin]);

  const i18nValue = React.useMemo(() => ({ t: getDictionary(uiLanguage), locale: LOCALE_TAG[uiLanguage] }), [uiLanguage]);
  const value = React.useMemo<AppState>(
    () => ({ status, snapshot, loadedAt, activeSubjectId, t: i18nValue.t, locale: i18nValue.locale, actions }),
    [status, snapshot, loadedAt, activeSubjectId, i18nValue, actions],
  );

  return (
    <ActionsContext.Provider value={actions}>
      <I18nContext.Provider value={i18nValue}>
        <AppContext.Provider value={value}>{children}</AppContext.Provider>
      </I18nContext.Provider>
    </ActionsContext.Provider>
  );
}

/** The data actions only. Stable for the life of the provider, so using it never causes a re-render. */
export function useActions(): Actions {
  const ctx = React.useContext(ActionsContext);
  if (!ctx) throw new Error("useActions must be used inside <AppProvider>");
  return ctx;
}

/** The dictionary and locale only: changes with the interface language, not with the user's data. */
export function useI18n(): { t: Dictionary; locale: string } {
  const ctx = React.useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <AppProvider>");
  return ctx;
}

export function useApp(): AppState {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

/** Ready-state accessor: guarantees a loaded snapshot (the shell only renders pages once ready). */
export function useVault() {
  const app = useApp();
  if (!app.snapshot) throw new Error("useVault called before the vault was ready");
  return { ...app, snapshot: app.snapshot, user: app.snapshot.user };
}
