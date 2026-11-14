import "server-only";

import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { authConfig } from "@/auth.config";
import { getPrisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/password";

const credentialsSchema = z.object({
  email: z.email().max(254).transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1).max(200),
});

/** Auth.js (NextAuth v5): email + password against `users.password_hash` (bcrypt), JWT session cookie. */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await getPrisma().user.findUnique({
          where: { email: parsed.data.email },
          select: { id: true, email: true, displayName: true, role: true, passwordHash: true },
        });
        // Always compare (against a decoy when there is no such account) so timing does not reveal who is registered.
        if (!(await verifyPassword(parsed.data.password, user?.passwordHash)) || !user) return null;
        return { id: user.id, email: user.email, name: user.displayName, role: user.role };
      },
    }),
  ],
});
