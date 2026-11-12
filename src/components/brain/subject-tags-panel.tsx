"use client";

import { Loader2, Tags } from "lucide-react";
import * as React from "react";

import { useVault } from "@/components/app-provider";
import { TagSuggestionBanner } from "@/components/brain/tag-suggestion-banner";
import { CrosshairCard } from "@/components/crosshair-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { aiErrorMessage, useSubjectAi } from "@/components/use-subject-ai";
import { requestTagSuggestions } from "@/lib/ai-client";
import { buildTagSuggestRequest } from "@/lib/brain";
import { format } from "@/lib/i18n";
import type { Subject } from "@/lib/repo/types";
import { tagDisplayName, tagsForSubject } from "@/lib/tags";
import { cn } from "@/lib/utils";

/** The subject's adaptive error-tag vocabulary, an on-demand "Suggest tags" call and the suggestion banner. */
export function SubjectTagsPanel({ subject }: { subject: Subject }) {
  const { snapshot, t, actions } = useVault();
  const ai = useSubjectAi(subject);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    const abort = abortRef;
    return () => abort.current?.abort();
  }, []);

  const tags = tagsForSubject(snapshot.tags, subject.id);
  const subjectCards = new Set(snapshot.cards.filter((c) => c.subjectId === subject.id).map((c) => c.id));
  const uses = (tagId: string) => snapshot.cardTags.filter((l) => l.tagId === tagId && subjectCards.has(l.cardId)).length;

  async function suggest() {
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const call = ai.call(controller.signal);
    if (!call || !ai.key) return setNotice({ tone: "error", text: t.ai.errors.NO_KEY });
    const request = buildTagSuggestRequest({
      subject, cards: snapshot.cards, logs: snapshot.logs, topics: snapshot.topics, tags: snapshot.tags, cardTags: snapshot.cardTags,
      persona: snapshot.persona, suggestions: snapshot.tagSuggestions, dictionary: t,
    });
    if (!request) return setNotice({ tone: "error", text: t.adaptive.needNotes });
    setBusy(true);
    setNotice(null);
    try {
      const result = await requestTagSuggestions(call, request);
      const created = result.suggestions.length
        ? await actions.addTagSuggestions(subject.id, result.suggestions.map((s) => ({ ...s, aiProvider: ai.key!.provider, aiModel: result.model, outputLanguage: ai.language })))
        : [];
      if (created.length === 0) setNotice({ tone: "ok", text: t.adaptive.noSuggestion });
    } catch (err) {
      if (!controller.signal.aborted) setNotice({ tone: "error", text: aiErrorMessage(t, err) });
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <CrosshairCard className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Tags className="size-4 text-primary" aria-hidden />
            {t.adaptive.title}
          </h2>
          <p className="max-w-2xl text-xs text-muted-foreground">{t.adaptive.subtitle}</p>
        </div>
        <Button variant="outline" size="lg" onClick={() => void suggest()} disabled={busy || !ai.key} title={ai.key ? undefined : t.ai.noKey}>
          {busy && <Loader2 className="animate-spin" />}
          {busy ? t.adaptive.suggesting : t.adaptive.suggest}
        </Button>
      </div>

      <ul className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <li key={tag.id} className="flex items-center gap-2 rounded-full border border-border bg-muted/30 py-1 pr-1.5 pl-3 text-sm" title={tag.description ?? undefined}>
            <span className="size-2 rounded-full" style={{ backgroundColor: tag.color ?? "var(--muted-foreground)" }} aria-hidden />
            <span>{tagDisplayName(t, tag)}</span>
            <span className="metric text-xs text-muted-foreground">{format(t.adaptive.uses, { n: uses(tag.id) })}</span>
            {tag.origin !== "USER" && (
              <Badge variant={tag.origin === "AI_ACCEPTED" ? "default" : "outline"} className="text-[10px]">
                {tag.origin === "AI_ACCEPTED" ? t.adaptive.aiTag : t.adaptive.base}
              </Badge>
            )}
          </li>
        ))}
      </ul>

      {notice && (
        <p role={notice.tone === "error" ? "alert" : "status"} className={cn("text-sm", notice.tone === "error" ? "text-destructive" : "text-muted-foreground")}>
          {notice.text}
        </p>
      )}
      <TagSuggestionBanner subjectId={subject.id} />
    </CrosshairCard>
  );
}
