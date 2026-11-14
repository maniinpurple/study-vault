import type { NextAuthConfig } from "next-auth";

/**
 * Auth.js settings that need no database, so the proxy can verify a session cookie without loading Prisma or bcrypt.
 * `src/auth.ts` adds the Credentials provider on top of this.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  // Credentials sign-in issues a signed, encrypted JWT cookie; there is no session row to look up per request.
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.role = user.role === "ADMIN" ? "ADMIN" : "USER";
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      // Informational only: /admin re-reads the role from the database on every request.
      session.user.role = token.role === "ADMIN" ? "ADMIN" : "USER";
      return session;
    },
  },
} satisfies NextAuthConfig;
