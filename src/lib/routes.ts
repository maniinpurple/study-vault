/** Route classification shared by the proxy and the auth pages. Pure. */

/** Pages a signed-out visitor may open. Everything else the proxy matches requires a session. */
export const AUTH_PATHS = ["/login", "/register"] as const;

export function isAuthPath(pathname: string): boolean {
  return AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Where to send someone after signing in. Only same-origin paths are accepted, so a crafted `?next=` cannot
 * bounce a user to another site; anything else falls back to the home page.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || isAuthPath(next.split("?")[0])) return "/";
  return next;
}
