import "server-only";

import { z } from "zod";

import { auth } from "@/auth";

/** Thrown when a request has no valid session. Server actions turn it into `{ ok: false, code: "UNAUTHENTICATED" }`. */
export class UnauthorizedError extends Error {
  readonly code = "UNAUTHENTICATED";
  constructor() {
    super("UNAUTHENTICATED");
    this.name = "UnauthorizedError";
  }
}

/** Id of the signed-in user, or null. The id comes from the verified session cookie — never from request input. */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  const id = z.uuid().safeParse(session?.user?.id);
  return id.success ? id.data : null;
}

/** Id of the signed-in user. Every data access goes through this, then scopes its queries by the returned id. */
export async function requireUserId(): Promise<string> {
  const id = await currentUserId();
  if (!id) throw new UnauthorizedError();
  return id;
}
