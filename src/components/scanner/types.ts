import type { CropBox } from "@/lib/repo/types";
import type { NormBox } from "@/lib/scan-geometry";

/** A question box drawn on a page, with an optional figure/graph sub-box on the same page. */
export interface ScanBox {
  id: string;
  /** Stable 1-based question number shown on the page and in the draft. */
  number: number;
  page: number;
  box: NormBox;
  figure: NormBox | null;
}

export type DraftStatus = "queued" | "processing" | "done" | "failed";

/** A card being reviewed before it is saved. Every note field is optional by design. */
export interface Draft {
  id: string;
  number: number;
  page: number;
  cropBox: CropBox;
  figureBox: CropBox | null;
  status: DraftStatus;
  errorCode: string | null;
  questionLatex: string;
  ocrRawText: string | null;
  ocrModel: string | null;
  ocrConfidence: number | null;
  containsFigure: boolean;
  /** Untouched crop (never filtered), kept for the "View Original Crop" verification toggle. */
  originalBlob: Blob;
  /** Figure/graph crop to show below the rewritten text. */
  diagramBlob: Blob | null;
  subjectId: string | null;
  topicId: string | null;
  title: string;
  ahaNote: string;
  /** Correct answer / worked solution (Markdown + KaTeX) — shown in review to check your answer against. Optional. */
  solution: string;
  teacherNote: string;
  isHighYield: boolean;
  tagIds: string[];
  saving: boolean;
  saved: boolean;
  saveErrorCode: string | null;
}
