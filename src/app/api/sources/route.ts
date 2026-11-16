import { createHash } from "node:crypto";

import { SCAN_LIMITS } from "@/lib/constants";
import { RepoError } from "@/lib/repo/types";
import { getRepository } from "@/server/repository";
import { IMAGE_MIME_TYPES, newUploadMetaSchema, SOURCE_MIME_TYPES } from "@/server/schemas";
import { currentUserId } from "@/server/session";

const MAX_THUMBNAIL_BYTES = 1024 * 1024;
const fail = (error: string, status: number) => Response.json({ error }, { status });
const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

/**
 * Upload a source: multipart `meta` (JSON) + one `files` part per page (a single PDF, or photos in page order) +
 * an optional `thumbnail`. A route handler rather than a server action because exam PDFs are large.
 * Limits and file types are enforced here, and the fingerprint is computed from the bytes actually received.
 */
export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return fail("UNAUTHENTICATED", 401);

  let form: FormData;
  let metaJson: unknown;
  try {
    form = await request.formData();
    metaJson = JSON.parse(String(form.get("meta") ?? ""));
  } catch {
    return fail("INVALID_REQUEST", 400);
  }
  const meta = newUploadMetaSchema.safeParse(metaJson);
  const files = form.getAll("files").filter((part): part is File => part instanceof File && part.size > 0);
  const thumbnail = form.get("thumbnail");
  if (!meta.success || files.length === 0) return fail("INVALID_REQUEST", 400);

  const allowed: readonly string[] = meta.data.fileKind === "PDF" ? ["application/pdf"] : SOURCE_MIME_TYPES.filter((type) => type !== "application/pdf");
  if (files.some((file) => !allowed.includes(file.type)) || (meta.data.fileKind === "PDF" && files.length !== 1)) return fail("UNSUPPORTED", 415);
  if (files.length > SCAN_LIMITS.maxPdfPages) return fail("TOO_MANY_PAGES", 413);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalBytes > SCAN_LIMITS.maxFileBytes) return fail("TOO_BIG", 413);
  const thumb = thumbnail instanceof File && thumbnail.size > 0 && thumbnail.size <= MAX_THUMBNAIL_BYTES && (IMAGE_MIME_TYPES as readonly string[]).includes(thumbnail.type) ? thumbnail : null;

  try {
    // Same scheme as the browser's `fingerprintFiles`: the file's hash, or the hash of the ordered page hashes.
    const hashes = await Promise.all(files.map(async (file) => sha256(new Uint8Array(await file.arrayBuffer()))));
    const upload = await getRepository().createUpload(userId, {
      title: meta.data.title,
      subjectId: meta.data.subjectId,
      completed: meta.data.completed,
      deadline: meta.data.deadline,
      fileKind: meta.data.fileKind,
      mimeType: files[0].type,
      fileSizeBytes: totalBytes,
      pageCount: meta.data.fileKind === "IMAGE" ? files.length : meta.data.pageCount,
      sha256: hashes.length === 1 ? hashes[0] : sha256(hashes.join(":")),
      files,
      thumbnail: thumb,
    });
    return Response.json({ id: upload.id }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof RepoError) return fail(err.code, err.code === "NOT_FOUND" ? 404 : 400);
    console.error("[vaultlearn] source upload failed", err);
    return fail("INTERNAL", 500);
  }
}
