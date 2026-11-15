/**
 * Structural sharing for the user's snapshot. Every server action returns a complete, freshly deserialized snapshot, so every
 * object in it is a new identity even when nothing about it changed. Replacing state with it re-renders every component that
 * holds one of those objects, `React.memo` included. `shareStructure(prev, next)` returns `next`'s data re-using every `prev`
 * object that is deeply equal, so unchanged cards, tags and links keep their identity and memoized components skip the render.
 * Pure and dependency-free.
 */

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);

/** Stable identity of a list item: its `id`, or the two ids of a link row. Null when it has none (matched by position). */
function itemKey(item: unknown): string | null {
  if (!isRecord(item)) return null;
  if (typeof item.id === "string") return item.id;
  if (typeof item.cardId === "string" && typeof item.tagId === "string") return `${item.cardId}:${item.tagId}`;
  if (typeof item.problemId === "string" && typeof item.cardId === "string") return `${item.problemId}:${item.cardId}`;
  return null;
}

/** `next` with every part that is deeply equal to the same part of `prev` replaced by `prev`'s own object. */
export function shareStructure<T>(prev: unknown, next: T): T {
  if (prev === next) return next;
  if (prev instanceof Date && next instanceof Date) return (prev.getTime() === next.getTime() ? prev : next) as T;

  if (Array.isArray(prev) && Array.isArray(next)) {
    const byKey = new Map<string, unknown>();
    for (const item of prev) {
      const key = itemKey(item);
      if (key !== null) byKey.set(key, item);
    }
    const shared = next.map((item, i) => {
      const key = itemKey(item);
      return shareStructure(key !== null ? byKey.get(key) : prev[i], item);
    });
    return (shared.length === prev.length && shared.every((item, i) => item === prev[i]) ? prev : shared) as T;
  }

  if (isRecord(prev) && isRecord(next)) {
    const keys = Object.keys(next);
    let same = keys.length === Object.keys(prev).length;
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      out[key] = shareStructure(prev[key], next[key]);
      if (out[key] !== prev[key]) same = false;
    }
    return (same ? prev : out) as T;
  }

  return next;
}
