import "server-only";

import { getPrisma } from "@/lib/db/prisma";
import { PrismaRepository } from "@/lib/repo/prisma";
import type { Repository } from "@/lib/repo/types";

let instance: Repository | null = null;

/** The PostgreSQL repository. Server-only: the browser reaches it through the server actions and /api routes. */
export function getRepository(): Repository {
  instance ??= new PrismaRepository(getPrisma());
  return instance;
}
