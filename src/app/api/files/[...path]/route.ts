import { getRepository } from "@/server/repository";
import { SOURCE_MIME_TYPES } from "@/server/schemas";
import { currentUserId } from "@/server/session";

/**
 * Serves a stored file (exam PDF/photo, thumbnail, question crop) to its owner only: the lookup is by path AND the
 * signed-in user's id, so another user's path simply does not exist (404 rather than 403 — no existence oracle).
 */
export async function GET(_request: Request, context: RouteContext<"/api/files/[...path]">) {
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  const { path } = await context.params;
  const file = await getRepository().getBlob(userId, path.join("/"));
  if (!file) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  // Only known document/image types are served as themselves; nothing a user stored can run as a page on this origin.
  const type = (SOURCE_MIME_TYPES as readonly string[]).includes(file.mimeType) ? file.mimeType : "application/octet-stream";
  return new Response(new Blob([new Uint8Array(file.data)], { type }), {
    headers: {
      "content-type": type,
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
      // Paths are never reused for different bytes, so the owner's browser may keep them.
      "cache-control": "private, max-age=31536000, immutable",
    },
  });
}
