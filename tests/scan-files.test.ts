import { describe, expect, it } from "vitest";

import { SCAN_LIMITS } from "@/lib/constants";
import { detectKind, orderPhotoPages, planScanFiles, type FileLike } from "@/lib/scan-files";

const file = (name: string, extra: Partial<FileLike> = {}): FileLike => ({ name, type: "", size: 1000, lastModified: 0, ...extra });

describe("detectKind", () => {
  it("recognises PDFs and photos by MIME type or extension", () => {
    expect(detectKind({ name: "a.bin", type: "application/pdf" })).toBe("PDF");
    expect(detectKind({ name: "SCAN.PDF", type: "" })).toBe("PDF");
    expect(detectKind({ name: "IMG_1.HEIC", type: "" })).toBe("IMAGE");
    expect(detectKind({ name: "x", type: "image/webp" })).toBe("IMAGE");
    expect(detectKind({ name: "notes.docx", type: "" })).toBe("DOCX");
    expect(detectKind({ name: "x", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })).toBe("DOCX");
    expect(detectKind({ name: "old.doc", type: "application/msword" })).toBeNull();
  });
});

describe("orderPhotoPages", () => {
  it("sorts naturally by filename so IMG_2 precedes IMG_10", () => {
    const names = orderPhotoPages(["IMG_10.jpg", "IMG_2.jpg", "IMG_1.jpg", "img_3.jpg"].map((n) => file(n))).map((f) => f.name);
    expect(names).toEqual(["IMG_1.jpg", "IMG_2.jpg", "img_3.jpg", "IMG_10.jpg"]);
  });
  it("breaks name ties by capture time and does not mutate its input", () => {
    const input = [file("a.jpg", { lastModified: 5 }), file("a.jpg", { lastModified: 1 })];
    expect(orderPhotoPages(input).map((f) => f.lastModified)).toEqual([1, 5]);
    expect(input[0].lastModified).toBe(5);
  });
});

describe("planScanFiles", () => {
  it("accepts a single PDF", () => {
    const plan = planScanFiles([file("exam.pdf")]);
    expect(plan).toMatchObject({ ok: true, kind: "PDF" });
  });
  it("accepts several photos as ordered pages (4-page exam)", () => {
    const plan = planScanFiles(["IMG_2043.jpg", "IMG_2041.jpg", "IMG_2044.jpg", "IMG_2042.jpg"].map((n) => file(n, { type: "image/jpeg" })));
    expect(plan.ok && plan.kind).toBe("IMAGE");
    expect(plan.ok && plan.files.map((f) => f.name)).toEqual(["IMG_2041.jpg", "IMG_2042.jpg", "IMG_2043.jpg", "IMG_2044.jpg"]);
  });
  it("rejects empty, unsupported, mixed and multiple-PDF selections", () => {
    expect(planScanFiles([])).toEqual({ ok: false, code: "UNSUPPORTED" });
    expect(planScanFiles([file("a.jpg"), file("b.txt")])).toEqual({ ok: false, code: "UNSUPPORTED" });
    expect(planScanFiles([file("a.jpg"), file("b.pdf")])).toEqual({ ok: false, code: "MIXED_FILES" });
    expect(planScanFiles([file("a.pdf"), file("b.pdf")])).toEqual({ ok: false, code: "MIXED_FILES" });
  });
  it("enforces the total size and page limits", () => {
    const half = SCAN_LIMITS.maxFileBytes / 2 + 1;
    expect(planScanFiles([file("a.jpg", { size: half }), file("b.jpg", { size: half })])).toEqual({ ok: false, code: "TOO_BIG" });
    const many = Array.from({ length: SCAN_LIMITS.maxPdfPages + 1 }, (_, i) => file(`p${i}.jpg`, { size: 1 }));
    expect(planScanFiles(many)).toEqual({ ok: false, code: "TOO_MANY_PAGES" });
  });
});
