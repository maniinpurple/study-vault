import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/auth.config";
import { isAuthPath } from "@/lib/routes";

const { auth } = NextAuth(authConfig);

/**
 * Gatekeeper for every page: signed-out visitors go to /login (remembering where they were headed), and signed-in
 * users are kept off the auth pages. This is the first line only — server actions, route handlers and /admin
 * verify the session again themselves (see src/server/session.ts).
 */
export const proxy = auth((request) => {
  const { pathname, search } = request.nextUrl;
  const signedIn = Boolean(request.auth?.user?.id);

  if (isAuthPath(pathname)) return signedIn ? NextResponse.redirect(new URL("/", request.nextUrl)) : NextResponse.next();
  if (signedIn) return NextResponse.next();

  const login = new URL("/login", request.nextUrl);
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
});

export const config = {
  // Pages only. /api routes authenticate inside the handler (and stay out of the proxy's request-body buffering);
  // static assets need no session.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml|mjs|map)$).*)"],
};
