/**
 * Browser-only exam source: renders PDF pages (PDF.js) or a photo to canvases, crops them, applies the scan filter,
 * and encodes crops. Imported only from client components; PDF.js is loaded lazily so SSR never evaluates it.
 */
import { SCAN_LIMITS, type FileKind } from "@/lib/constants";
import { applyDocumentScan } from "@/lib/scan-filter";
import { planScanFiles, type ScanErrorCode } from "@/lib/scan-files";
import { fitLongEdge, toPixelRect, type NormBox } from "@/lib/scan-geometry";

export type { ScanErrorCode } from "@/lib/scan-files";

export class ScanSourceError extends Error {
  constructor(readonly code: ScanErrorCode) {
    super(code);
    this.name = "ScanSourceError";
  }
}

export interface ScanSource {
  kind: FileKind;
  pageCount: number;
  /** Render a 1-based page to a fresh canvas whose long edge is `maxLongEdge` px (PDFs are scaled to it; photos only shrink). */
  renderPage(page: number, maxLongEdge: number): Promise<HTMLCanvasElement>;
  destroy(): void;
}

function newCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: false });
  if (!ctx) throw new ScanSourceError("UNREADABLE");
  return ctx;
}

async function openPdf(file: File): Promise<ScanSource> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  let doc: Awaited<ReturnType<typeof pdfjs.getDocument>["promise"]>;
  try {
    doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  } catch (err) {
    throw new ScanSourceError(err instanceof Error && err.name === "PasswordException" ? "ENCRYPTED" : "UNREADABLE");
  }
  if (doc.numPages > SCAN_LIMITS.maxPdfPages) {
    void doc.loadingTask.destroy();
    throw new ScanSourceError("TOO_MANY_PAGES");
  }

  // pdf.js renders are serialised so only one full-resolution page bitmap is being produced at a time.
  let queue: Promise<unknown> = Promise.resolve();
  return {
    kind: "PDF",
    pageCount: doc.numPages,
    renderPage(pageNumber, maxLongEdge) {
      const job = queue.then(async () => {
        const page = await doc.getPage(pageNumber);
        try {
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: maxLongEdge / Math.max(base.width, base.height) });
          const canvas = newCanvas(Math.max(1, Math.floor(viewport.width)), Math.max(1, Math.floor(viewport.height)));
          const ctx = context2d(canvas);
          ctx.fillStyle = "#ffffff"; // PDFs are transparent by default
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          return canvas;
        } finally {
          page.cleanup();
        }
      });
      queue = job.catch(() => undefined);
      return job;
    },
    destroy() {
      void doc.loadingTask.destroy();
    },
  };
}

async function decodePhoto(file: File): Promise<ImageBitmap> {
  try {
    // "from-image" applies the EXIF orientation so portrait phone photos are not sideways.
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ScanSourceError("UNREADABLE");
  }
}

/** Photos as sequential pages. Each is decoded only while it is being drawn, so a 20-photo exam never holds 20 bitmaps. */
async function openPhotos(files: File[]): Promise<ScanSource> {
  (await decodePhoto(files[0])).close(); // fail fast if the first photo is not decodable
  return {
    kind: "IMAGE",
    pageCount: files.length,
    async renderPage(pageNumber, maxLongEdge) {
      const file = files[pageNumber - 1];
      if (!file) throw new ScanSourceError("UNREADABLE");
      const bitmap = await decodePhoto(file);
      try {
        const { width, height } = fitLongEdge(bitmap.width, bitmap.height, maxLongEdge);
        const canvas = newCanvas(width, height);
        const ctx = context2d(canvas);
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(bitmap, 0, 0, width, height);
        return canvas;
      } finally {
        bitmap.close();
      }
    },
    destroy() {},
  };
}

/** Open a PDF, or one-or-more photos as pages. `files` must already be validated and ordered by `planScanFiles`. */
export async function openScanSource(files: File[], kind: FileKind): Promise<ScanSource> {
  return kind === "PDF" ? openPdf(files[0]) : openPhotos(files);
}

/** Validate + order the user's selection and open it. Throws `ScanSourceError` for any problem. */
export async function openScanSelection(selection: readonly File[]): Promise<{ source: ScanSource; files: File[] }> {
  const plan = planScanFiles(selection);
  if (!plan.ok) throw new ScanSourceError(plan.code);
  return { source: await openScanSource(plan.files, plan.kind), files: plan.files };
}

/** Grayscale/shadow-flattened copy of `canvas` ("High-Contrast Document Scan"). The input is left untouched. */
export function filterCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const out = newCanvas(canvas.width, canvas.height);
  const ctx = context2d(out);
  ctx.drawImage(canvas, 0, 0);
  const image = ctx.getImageData(0, 0, out.width, out.height);
  applyDocumentScan(image.data, out.width, out.height);
  ctx.putImageData(image, 0, 0);
  return out;
}

/** Crop a normalised box out of `canvas`; shrinks the result if its long edge exceeds `maxLongEdge`. */
export function cropCanvas(canvas: HTMLCanvasElement, box: NormBox, maxLongEdge?: number): HTMLCanvasElement {
  const { sx, sy, sw, sh } = toPixelRect(box, canvas.width, canvas.height);
  const { width, height } = maxLongEdge ? fitLongEdge(sw, sh, maxLongEdge) : { width: sw, height: sh };
  const out = newCanvas(width, height);
  const ctx = context2d(out);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, width, height);
  return out;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: "image/jpeg" | "image/png", quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new ScanSourceError("UNREADABLE"))), type, quality);
  });
}

/** Base64 (no `data:` prefix) JPEG for the vision model. */
export function canvasToBase64Jpeg(canvas: HTMLCanvasElement, quality = 0.85): string {
  return canvas.toDataURL("image/jpeg", quality).split(",")[1] ?? "";
}

/** Fingerprint of an exam: the file's SHA-256, or for several photos the SHA-256 of their ordered hashes. */
export async function fingerprintFiles(files: readonly File[]): Promise<string> {
  const parts = await Promise.all(files.map(fingerprintFile));
  if (parts.length === 1) return parts[0];
  const joined = parts.join(":");
  if (!globalThis.crypto?.subtle) return `weak:${joined}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(joined));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 (hex) of the file. Falls back to a weak size/name fingerprint when WebCrypto is unavailable (plain-http LAN testing). */
export async function fingerprintFile(file: File): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  return `weak:${file.size}:${file.lastModified}:${file.name}`;
}

function lruSet<K, V>(map: Map<K, V>, key: K, value: V, max: number) {
  map.delete(key);
  map.set(key, value);
  while (map.size > max) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
}

export type PageView = "original" | "scan";

/** An opened exam file plus a small LRU of rendered pages (full-resolution bitmaps are large, so only a few stay in memory). */
export class ScanDocument {
  readonly id = crypto.randomUUID();
  private readonly raw = new Map<number, HTMLCanvasElement>();
  private readonly scan = new Map<number, HTMLCanvasElement>();

  constructor(
    readonly source: ScanSource,
    /** The exam's files in page order: one PDF, or one photo per page. */
    readonly files: readonly File[],
    readonly sha256: string,
  ) {}

  /** First file's name — the exam's display name. */
  get name(): string {
    return this.files[0]?.name ?? "";
  }

  get totalBytes(): number {
    return this.files.reduce((sum, f) => sum + f.size, 0);
  }

  get pageCount(): number {
    return this.source.pageCount;
  }

  /** Rendered page canvas: untouched pixels, or the high-contrast document-scan version. The returned canvas must not be mutated. */
  async pageCanvas(page: number, view: PageView): Promise<HTMLCanvasElement> {
    let raw = this.raw.get(page);
    if (!raw) {
      raw = await this.source.renderPage(page, SCAN_LIMITS.renderLongEdge);
      lruSet(this.raw, page, raw, 3);
    }
    if (view === "original") return raw;
    let scan = this.scan.get(page);
    if (!scan) {
      scan = filterCanvas(raw);
      lruSet(this.scan, page, scan, 2);
    }
    return scan;
  }

  destroy() {
    this.raw.clear();
    this.scan.clear();
    this.source.destroy();
  }
}

/** Base64 (no `data:` prefix) of a blob. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(blob);
  });
}
