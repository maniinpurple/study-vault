/**
 * Optimistic edits of the snapshot: what the UI shows the instant a control is used, before the server has answered. Each one
 * is a pure function of the snapshot and touches only what the real action would change, so unchanged objects keep their identity
 * (and memoized components skip the render). The server's own snapshot replaces the result when it arrives.
 */
import type { CardPatch, MistakeCardTag, UploadPatch, UserPatch, UserSnapshot } from "@/lib/repo/types";

/** A patch without its `undefined` values, which must not overwrite stored ones. */
function defined<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as Partial<T>;
}

export function patchCard(snapshot: UserSnapshot, cardId: string, patch: CardPatch): UserSnapshot {
  if (!snapshot.cards.some((card) => card.id === cardId)) return snapshot;
  const changes = defined(patch);
  return { ...snapshot, cards: snapshot.cards.map((card) => (card.id === cardId ? { ...card, ...changes } : card)) };
}

export function patchUpload(snapshot: UserSnapshot, uploadId: string, patch: UploadPatch): UserSnapshot {
  if (!snapshot.examUploads.some((upload) => upload.id === uploadId)) return snapshot;
  const changes = defined(patch);
  return { ...snapshot, examUploads: snapshot.examUploads.map((upload) => (upload.id === uploadId ? { ...upload, ...changes } : upload)) };
}

export function patchUser(snapshot: UserSnapshot, patch: UserPatch): UserSnapshot {
  return { ...snapshot, user: { ...snapshot.user, ...defined(patch) } };
}

/** Make `tagIds` exactly the tags of the card, keeping the links that stay and every other card's links as they are. */
export function setCardTagLinks(snapshot: UserSnapshot, cardId: string, tagIds: readonly string[], now: Date = new Date()): UserSnapshot {
  const wanted = new Set(tagIds);
  const have = new Set(snapshot.cardTags.filter((link) => link.cardId === cardId).map((link) => link.tagId));
  const kept = snapshot.cardTags.filter((link) => link.cardId !== cardId || wanted.has(link.tagId));
  const added: MistakeCardTag[] = [...wanted].filter((tagId) => !have.has(tagId)).map((tagId) => ({ cardId, tagId, assignedBy: "USER", confidence: null, createdAt: now }));
  if (added.length === 0 && kept.length === snapshot.cardTags.length) return snapshot;
  return { ...snapshot, cardTags: [...kept, ...added] };
}

/** A deleted problem and everything that hangs off it. */
export function removeCard(snapshot: UserSnapshot, cardId: string): UserSnapshot {
  return {
    ...snapshot,
    cards: snapshot.cards.filter((card) => card.id !== cardId),
    logs: snapshot.logs.filter((log) => log.cardId !== cardId),
    cardTags: snapshot.cardTags.filter((link) => link.cardId !== cardId),
  };
}
