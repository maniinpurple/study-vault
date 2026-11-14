"use server";

import { AuthError } from "next-auth";
import { z } from "zod";

import { signIn, signOut } from "@/auth";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { hashPassword, passwordFitsBcrypt, PASSWORD_MIN_LENGTH } from "@/lib/password";
import { safeNextPath } from "@/lib/routes";

/** What a sign-in / registration form receives back. `error` is a dictionary key under `auth.errors`. */
export interface AuthFormState {
  error?: string;
  /** Echoed back so a failed submit does not clear the fields. Never the password. */
  values?: { name?: string; email?: string };
}

const emailSchema = z.email().max(254).transform((v) => v.trim().toLowerCase());
const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value : "");

export async function loginAction(_previous: AuthFormState, form: FormData): Promise<AuthFormState> {
  const values = { email: text(form.get("email")).trim() };
  const password = text(form.get("password"));
  if (!emailSchema.safeParse(values.email).success) return { error: "INVALID_EMAIL", values };
  if (!password) return { error: "PASSWORD_REQUIRED", values };

  try {
    // On success Auth.js throws a redirect, which must propagate; it is not an AuthError.
    await signIn("credentials", { email: values.email, password, redirectTo: safeNextPath(text(form.get("next"))) });
  } catch (err) {
    if (err instanceof AuthError) return { error: err.type === "CredentialsSignin" ? "INVALID_CREDENTIALS" : "UNKNOWN", values };
    throw err;
  }
  return { values };
}

export async function registerAction(_previous: AuthFormState, form: FormData): Promise<AuthFormState> {
  const name = text(form.get("name")).replace(/\s+/g, " ").trim();
  const values = { name, email: text(form.get("email")).trim() };
  const password = text(form.get("password"));
  const language = form.get("language") === "EN" ? "EN" : "VI";

  const email = emailSchema.safeParse(values.email);
  if (!name) return { error: "NAME_REQUIRED", values };
  if (!email.success) return { error: "INVALID_EMAIL", values };
  if (password.length < PASSWORD_MIN_LENGTH) return { error: "PASSWORD_TOO_SHORT", values };
  if (!passwordFitsBcrypt(password)) return { error: "PASSWORD_TOO_LONG", values };

  try {
    await getPrisma().user.create({
      data: {
        email: email.data,
        displayName: name.slice(0, 80),
        passwordHash: await hashPassword(password),
        authProvider: "CREDENTIALS",
        uiLanguage: language,
        defaultAiOutputLanguage: language,
        onboardedAt: new Date(),
      },
      select: { id: true },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return { error: "EMAIL_TAKEN", values };
    console.error("[vaultlearn] registration failed", err);
    return { error: "UNKNOWN", values };
  }

  try {
    await signIn("credentials", { email: email.data, password, redirectTo: "/" });
  } catch (err) {
    if (err instanceof AuthError) return { error: "UNKNOWN", values };
    throw err;
  }
  return { values };
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
