import { describe, expect, it } from "vitest";

import { BASE_TAGS } from "@/lib/constants";
import { getDictionary, resolveI18nKey } from "@/lib/i18n";
import { en } from "@/lib/i18n/dictionaries/en";
import { vi } from "@/lib/i18n/dictionaries/vi";

function keyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([k, v]) => keyPaths(v, prefix ? `${prefix}.${k}` : k));
}

describe("dictionaries", () => {
  it("vi and en expose exactly the same keys", () => {
    expect(keyPaths(en).sort()).toEqual(keyPaths(vi).sort());
  });
  it("have no empty strings", () => {
    for (const dict of [vi, en]) for (const path of keyPaths(dict)) expect(resolveI18nKey(dict, path), path).toBeTruthy();
  });
  it("keeps the exact labels the scanner spec calls for in Vietnamese", () => {
    expect(vi.scanner.panel.extract).toBe("Tách câu hỏi (Extract Questions)");
    expect(vi.scanner.box.keepFigure).toBe("[+ Giữ hình vẽ/Đồ thị]");
    expect(vi.scanner.drafts.viewOriginal).toBe("Xem ảnh gốc (View Original Crop)");
    expect(vi.scanner.drafts.highYield).toBe("🔥 High-Yield / Cô nhấn mạnh (Hay ra thi)");
  });
  it("keeps the exact Phase 4 labels in Vietnamese", () => {
    expect(vi.review.mutate).toBe("⚡ AI Đổi số liệu (Mutate Numbers on the fly)");
    expect(vi.review.reveal).toBe("Hiện lời giải & Ghi chú (Reveal)");
    expect(vi.review.attemptNo).toBe("Lần {n}");
    expect(Object.values(vi.review.ratings)).toEqual(["Quên (Again)", "Khó (Hard)", "Nhớ (Good)", "Phản xạ nhanh (Easy)"]);
    expect(vi.brain.resync).toBe("🧠 Cập nhật nhận thức AI (Re-sync AI Memory)");
    expect(vi.adaptive.accept).toBe("Chấp nhận (Accept)");
    expect(vi.adaptive.decline).toBe("Không cần (Decline)");
    expect(Object.values(vi.adaptive.reasons)).toEqual(["Quá chi tiết", "Không đúng ý tôi", "Lý do khác..."]);
    expect(vi.synth.experimentalBadge).toBe("⚠️ Đề AI Thử Nghiệm (Có thể sai số) — Experimental AI Problem");
  });
});

describe("resolveI18nKey", () => {
  it("resolves every base tag key in both languages and rejects non-leaves", () => {
    for (const tag of BASE_TAGS) {
      expect(resolveI18nKey(getDictionary("VI"), tag.i18nKey)).toBe(vi.tags.base[tag.slug as keyof typeof vi.tags.base]);
      expect(resolveI18nKey(getDictionary("EN"), tag.i18nKey)).toBe(en.tags.base[tag.slug as keyof typeof en.tags.base]);
    }
    expect(resolveI18nKey(vi, "tags.base")).toBeNull();
    expect(resolveI18nKey(vi, "nope.nothing")).toBeNull();
  });
});
