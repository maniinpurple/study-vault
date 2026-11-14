import type { UserSnapshot } from "@/lib/repo/types";

/**
 * What every data action returns. A success carries the result and the user's fresh snapshot (one round trip per
 * mutation); a failure carries a stable code — `UNAUTHENTICATED`, a `RepoError` code, `INVALID_REQUEST`, or `INTERNAL`.
 */
export type ActionResult<T> = { ok: true; data: T; snapshot: UserSnapshot } | { ok: false; code: string };
