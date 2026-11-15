/**
 * Pure planning for the files chosen in the scanner: what kind of exam they form (one PDF, or one-or-more photos
 * treated as sequential pages), whether the selection is valid, and the page order. No DOM, so it is unit-tested.
 */
import { SCAN_LIMITS, type FileKind } from "@/lib/constants";

/** What the user picked: the stored kinds, plus Word documents (converted to page images in the browser before storing). */
export type ScanInputKind = FileKind | "DOCX";

export type ScanErrorCode = "UNSUPPORTED" | "TOO_BIG" | "TOO_MANY_PAGES" | "ENCRYPTED" | "UNREADABLE" | "MIXED_FILES";

export interface FileLike {
  name: string;
  type: string;
  size: number;
  lastModified: number;
}

const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"]);

export function detectKind(file: Pick<FileLike, "name" | "type">): ScanInputKind | null {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) return "PDF";
  if (file.type === DOCX_TYPE || /\.docx$/i.test(file.name)) return "DOCX";
  if (IMAGE_TYPES.has(file.type) || /\.(png|jpe?g|webp|heic|heif)$/i.test(file.name)) return "IMAGE";
  return null;
}

/**
 * Page order for photos: natural filename order (IMG_2 before IMG_10), then capture time. Phone cameras number
 * shots sequentially, so this matches the order the sheets were photographed in.
 */
export function orderPhotoPages<T extends Pick<FileLike, "name" | "lastModified">>(files: readonly T[]): T[] {
  return [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) || a.lastModified - b.lastModified);
}

export type ScanFilePlan<T> = { ok: true; kind: ScanInputKind; files: T[] } | { ok: false; code: ScanErrorCode };

/** Validate a selection: a single PDF or Word document, or any number of photos (never a mix) within the size/page limits. */
export function planScanFiles<T extends FileLike>(files: readonly T[]): ScanFilePlan<T> {
  if (files.length === 0) return { ok: false, code: "UNSUPPORTED" };
  const kinds = files.map(detectKind);
  if (kinds.some((k) => k === null)) return { ok: false, code: "UNSUPPORTED" };
  if (files.reduce((sum, f) => sum + f.size, 0) > SCAN_LIMITS.maxFileBytes) return { ok: false, code: "TOO_BIG" };
  if (kinds.includes("DOCX")) return files.length === 1 ? { ok: true, kind: "DOCX", files: [...files] } : { ok: false, code: "MIXED_FILES" };
  if (kinds.includes("PDF")) return files.length === 1 ? { ok: true, kind: "PDF", files: [...files] } : { ok: false, code: "MIXED_FILES" };
  if (files.length > SCAN_LIMITS.maxPdfPages) return { ok: false, code: "TOO_MANY_PAGES" };
  return { ok: true, kind: "IMAGE", files: orderPhotoPages(files) };
}
