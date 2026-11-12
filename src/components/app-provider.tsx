"use client";

import * as React from "react";

import { STORAGE_KEYS, THEME_ATTRIBUTE, type Language, type TagDeclineReason, type ThemePreference } from "@/lib/constants";
import type { MemorySyncResponse } from "@/lib/brain-prompt";
import { getDictionary, LOCALE_TAG, type Dictionary } from "@/lib/i18n";
import { seedDemoKeys } from "@/lib/repo/demo-keys";
import { getRepository } from "@/lib/repo/local";
import type {
  AdaptiveTag, AiSynthesizedProblem, ApiKeyPatch, CardAttemptLog, CardPatch, ExamPrepSession, MistakeCard, NewApiKey, NewExamPrepSession, NewExamUpload, NewScannedCard,
  NewSubject, NewSynthesizedProblem, NewTagSuggestion, PersonaPatch, Repository, ReviewInput, SaveScanResult, Subject, SubjectMemoryInput, SubjectPatch,
  SynthesizedProblemPatch, TagSuggestionFeedback, Topic, User, UserApiKey, UserSnapshot,
} from "@/lib/repo/types";

type Status = "loading" | "ready" | "error";

interface Actions {
  switchAccount(id: string): Promise<void>;
  createAccount(displayName: string): Promise<void>;
  deleteAccount(id: string): Promise<void>;
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
  saveScan(input: { upload: NewExamUpload; cards: NewScannedCard[] }): Promise<SaveScanResult>;
  /** Stored image/file for a card or upload path (null when missing). */
  getBlob(path: string): Promise<Blob | null>;

  // Phase 4
  reviewCard(input: ReviewInput): Promise<{ card: MistakeCard; log: CardAttemptLog }>;
  updateCard(id: string, patch: CardPatch): Promise<void>;
  setCardTags(cardId: string, tagIds: string[]): Promise<void>;
  saveSubjectMemory(subjectId: string, input: SubjectMemoryInput): Promise<void>;
  updatePersona(patch: PersonaPatch): Promise<void>;
  /** Persist one "Re-sync AI Memory" result: subject memory + persona + any tag suggestions, then reload once. */
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
  users: User[];
  snapshot: UserSnapshot | null;
  /** Time the snapshot was loaded; used by stats so render stays pure. */
  loadedAt: Date;
  activeSubjectId: string | null;
  t: Dictionary;
  locale: string;
  actions: Actions;
}

const AppContext = React.createContext<AppState | null>(null);

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

export function AppProvider({ children }: { children: React.ReactNode }) {
  const repo = React.useMemo<Repository>(() => getRepository(), []);
  const [status, setStatus] = React.useState<Status>("loading");
  const [users, setUsers] = React.useState<User[]>([]);
  const [snapshot, setSnapshot] = React.useState<UserSnapshot | null>(null);
  const [loadedAt, setLoadedAt] = React.useState(() => new Date(0));
  const [activeSubjectId, setActiveSubjectIdState] = React.useState<string | null>(null);
  const userIdRef = React.useRef<string | null>(null);

  const load = React.useCallback(
    async (preferredUserId?: string) => {
      const all = await repo.listUsers();
      const wanted = preferredUserId ?? userIdRef.current ?? readStorage(STORAGE_KEYS.activeAccount);
      const user = all.find((u) => u.id === wanted) ?? all[0];
      if (!user) throw new Error("No accounts");
      const snap = await repo.loadSnapshot(user.id);
      if (!snap) throw new Error("Snapshot missing");
      userIdRef.current = user.id;
      writeStorage(STORAGE_KEYS.activeAccount, user.id);
      setUsers(all);
      setSnapshot(snap);
      setLoadedAt(new Date());
      setActiveSubjectIdState((current) => {
        const stored = current ?? readStorage(`${STORAGE_KEYS.activeSubject}:${user.id}`);
        return snap.subjects.some((s) => s.id === stored && s.archivedAt === null) ? stored : null;
      });
    },
    [repo],
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await repo.init();
        await seedDemoKeys(repo);
        await load();
        if (!cancelled) setStatus("ready");
      } catch (err) {
        console.error("[vaultlearn] failed to open the local vault", err);
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, load]);

  const user = snapshot?.user ?? null;
  const uiLanguage: Language = user?.uiLanguage ?? "VI";
  const theme: ThemePreference = user?.theme ?? "OBSIDIAN";

  // Reflect per-account prefs on <html> and mirror them for the pre-hydration script (no flash on reload).
  React.useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = THEME_ATTRIBUTE[theme];
    root.lang = LOCALE_TAG[uiLanguage].split("-")[0];
    writeStorage(STORAGE_KEYS.prefs, JSON.stringify({ theme: THEME_ATTRIBUTE[theme], lang: root.lang }));
  }, [theme, uiLanguage]);

  const actions = React.useMemo<Actions>(() => {
    const uid = () => {
      if (!userIdRef.current) throw new Error("No active account");
      return userIdRef.current;
    };
    return {
      async switchAccount(id) {
        setActiveSubjectIdState(null);
        await load(id);
      },
      async createAccount(displayName) {
        const created = await repo.createUser({ displayName });
        setActiveSubjectIdState(null);
        await load(created.id);
      },
      async deleteAccount(id) {
        const all = await repo.listUsers();
        if (all.length <= 1) throw new Error("LAST_ACCOUNT");
        await repo.deleteUser(id);
        userIdRef.current = null;
        setActiveSubjectIdState(null);
        await load();
      },
      async setTheme(next) {
        await repo.updateUser(uid(), { theme: next });
        await load();
      },
      async setUiLanguage(next) {
        await repo.updateUser(uid(), { uiLanguage: next });
        await load();
      },
      async setDefaultAiLanguage(next) {
        await repo.updateUser(uid(), { defaultAiOutputLanguage: next });
        await load();
      },
      setActiveSubject(id) {
        setActiveSubjectIdState(id);
        writeStorage(`${STORAGE_KEYS.activeSubject}:${uid()}`, id);
      },
      async createSubject(input) {
        const created = await repo.createSubject(uid(), input);
        setActiveSubjectIdState(created.id);
        writeStorage(`${STORAGE_KEYS.activeSubject}:${uid()}`, created.id);
        await load();
        return created;
      },
      async updateSubject(id, patch) {
        await repo.updateSubject(uid(), id, patch);
        await load();
      },
      async deleteSubject(id) {
        await repo.deleteSubject(uid(), id);
        setActiveSubjectIdState((current) => (current === id ? null : current));
        writeStorage(`${STORAGE_KEYS.activeSubject}:${uid()}`, null);
        await load();
      },
      async createTopic(input) {
        const created = await repo.createTopic(uid(), input);
        await load();
        return created;
      },
      async renameTopic(id, name) {
        await repo.updateTopic(uid(), id, { name });
        await load();
      },
      async deleteTopic(id) {
        await repo.deleteTopic(uid(), id);
        await load();
      },
      async createApiKey(input) {
        const created = await repo.createApiKey(uid(), input);
        await load();
        return created;
      },
      async updateApiKey(id, patch) {
        await repo.updateApiKey(uid(), id, patch);
        await load();
      },
      async deleteApiKey(id) {
        await repo.deleteApiKey(uid(), id);
        await load();
      },
      async saveScan(input) {
        const result = await repo.saveScannedCards(uid(), input);
        await load();
        return result;
      },
      getBlob(path) {
        return repo.getBlob(uid(), path);
      },
      async reviewCard(input) {
        const result = await repo.reviewCard(uid(), input);
        await load();
        return result;
      },
      async updateCard(id, patch) {
        await repo.updateCard(uid(), id, patch);
        await load();
      },
      async setCardTags(cardId, tagIds) {
        await repo.setCardTags(uid(), cardId, tagIds);
        await load();
      },
      async saveSubjectMemory(subjectId, input) {
        await repo.saveSubjectMemory(uid(), subjectId, input);
        await load();
      },
      async updatePersona(patch) {
        await repo.updatePersona(uid(), patch);
        await load();
      },
      async applyMemorySync(subjectId, result, meta) {
        const userId = uid();
        try {
          await repo.saveSubjectMemory(userId, subjectId, { memorySummary: result.summary, memoryInsights: result.insights, source: "sync", memorySourceCardCount: meta.sourceCardCount });
          await repo.updatePersona(userId, { ...result.persona, synced: true, lastSyncModel: result.model, sourceAttemptCount: meta.sourceAttemptCount });
          return result.tagSuggestions.length > 0
            ? await repo.addTagSuggestions(userId, subjectId, result.tagSuggestions.map((s) => ({ ...s, ...meta.suggestionMeta })))
            : [];
        } finally {
          await load();
        }
      },
      async addTagSuggestions(subjectId, suggestions) {
        const created = await repo.addTagSuggestions(uid(), subjectId, suggestions);
        await load();
        return created;
      },
      async acceptTagSuggestion(id) {
        const tag = await repo.acceptTagSuggestion(uid(), id);
        await load();
        return tag;
      },
      async rejectTagSuggestion(id, reason, detail) {
        await repo.rejectTagSuggestion(uid(), id, reason, detail);
        await load();
      },
      async createExamPrepSession(input) {
        const created = await repo.createExamPrepSession(uid(), input);
        await load();
        return created;
      },
      async deleteExamPrepSession(id) {
        await repo.deleteExamPrepSession(uid(), id);
        await load();
      },
      async saveSynthesizedProblem(input) {
        const created = await repo.saveSynthesizedProblem(uid(), input);
        await load();
        return created;
      },
      async updateSynthesizedProblem(id, patch) {
        await repo.updateSynthesizedProblem(uid(), id, patch);
        await load();
      },
      async promoteSynthesizedProblem(id) {
        const card = await repo.promoteSynthesizedProblem(uid(), id);
        await load();
        return card;
      },
      async deleteSynthesizedProblem(id) {
        await repo.deleteSynthesizedProblem(uid(), id);
        await load();
      },
    };
  }, [repo, load]);

  const value = React.useMemo<AppState>(
    () => ({ status, users, snapshot, loadedAt, activeSubjectId, t: getDictionary(uiLanguage), locale: LOCALE_TAG[uiLanguage], actions }),
    [status, users, snapshot, loadedAt, activeSubjectId, uiLanguage, actions],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
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
