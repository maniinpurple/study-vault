import { describe, expect, it } from "vitest";

import { daysUntil, deadlineState, sortSources, todayIn, type HomeworkItem } from "@/lib/homework";

const item = (id: string, patch: Partial<HomeworkItem> = {}): HomeworkItem => ({ id, title: id, completed: false, deadline: null, createdAt: new Date("2026-11-01T00:00:00Z"), ...patch });
const ids = (list: readonly HomeworkItem[]) => list.map((i) => i.id);

describe("todayIn", () => {
  it("is the calendar day in the given time zone", () => {
    const instant = new Date("2026-11-15T20:30:00Z"); // 03:30 on the 16th in Vietnam
    expect(todayIn(instant, "Asia/Ho_Chi_Minh")).toBe("2026-11-16");
    expect(todayIn(instant, "UTC")).toBe("2026-11-15");
    expect(todayIn(instant, "Not/AZone")).toBe("2026-11-15");
  });
});

describe("deadline state", () => {
  const today = "2026-11-16";
  it("counts whole calendar days, across month ends", () => {
    expect(daysUntil("2026-11-19", today)).toBe(3);
    expect(daysUntil("2026-11-16", today)).toBe(0);
    expect(daysUntil("2026-11-10", today)).toBe(-6);
    expect(daysUntil("2026-12-01", today)).toBe(15);
  });
  it("classifies a source", () => {
    expect(deadlineState(item("a", { completed: true, deadline: "2026-11-01" }), today)).toEqual({ kind: "done" });
    expect(deadlineState(item("a"), today)).toEqual({ kind: "none" });
    expect(deadlineState(item("a", { deadline: "2026-11-14" }), today)).toEqual({ kind: "overdue", days: 2 });
    expect(deadlineState(item("a", { deadline: today }), today)).toEqual({ kind: "today" });
    expect(deadlineState(item("a", { deadline: "2026-11-18" }), today)).toEqual({ kind: "upcoming", days: 2, soon: true });
    expect(deadlineState(item("a", { deadline: "2026-11-30" }), today)).toEqual({ kind: "upcoming", days: 14, soon: false });
  });
});

describe("sortSources", () => {
  const list = [
    item("none-old", { createdAt: new Date("2026-10-01T00:00:00Z") }),
    item("late", { deadline: "2026-12-01" }),
    item("none-new", { createdAt: new Date("2026-11-10T00:00:00Z") }),
    item("soon", { deadline: "2026-11-17" }),
    item("done-early", { deadline: "2026-11-05", completed: true }),
    item("overdue", { deadline: "2026-11-01" }),
  ];

  it("deadline: closest first, unfinished before finished, no deadline always last (newest upload first)", () => {
    expect(ids(sortSources(list, "deadline", "vi"))).toEqual(["overdue", "soon", "late", "done-early", "none-new", "none-old"]);
  });

  it("deadline: a finished source without a deadline still sits below every source that has one", () => {
    const sorted = sortSources([item("x", { completed: true }), item("y", { deadline: "2027-01-01" })], "deadline", "vi");
    expect(ids(sorted)).toEqual(["y", "x"]);
  });

  it("deadline: ties go to the newer upload", () => {
    const sorted = sortSources([item("a", { deadline: "2026-11-20" }), item("b", { deadline: "2026-11-20", createdAt: new Date("2026-11-05T00:00:00Z") })], "deadline", "vi");
    expect(ids(sorted)).toEqual(["b", "a"]);
  });

  it("uploaded: newest first", () => {
    const sorted = sortSources(list, "uploaded", "vi");
    expect(sorted[0].id).toBe("none-new");
    expect(sorted[sorted.length - 1].id).toBe("none-old");
  });

  it("name: A–Z by locale (Vietnamese Đ follows D), ignoring case, numbers in natural order", () => {
    const names = [item("1", { title: "Đề 10" }), item("2", { title: "de 2" }), item("3", { title: "Bài kiểm tra" }), item("4", { title: "Đề 1" }), item("5", { title: "DE 11" })];
    expect(sortSources(names, "name", "vi").map((i) => i.title)).toEqual(["Bài kiểm tra", "de 2", "DE 11", "Đề 1", "Đề 10"]);
  });

  it("subject: by subject name, none last, ties by title", () => {
    const named = [item("a", { title: "Z" }), item("b", { title: "B" }), item("c", { title: "A" }), item("d", { title: "Y" })];
    const subjects: Record<string, string | null> = { a: "Toán", b: "Lý", c: null, d: "Toán" };
    expect(ids(sortSources(named, "subject", "vi", (i) => subjects[i.id]))).toEqual(["b", "d", "a", "c"]);
  });

  it("status: unfinished first, each group in deadline order", () => {
    const sorted = sortSources(list, "status", "vi");
    expect(ids(sorted)).toEqual(["overdue", "soon", "late", "none-new", "none-old", "done-early"]);
  });

  it("does not modify its input", () => {
    const copy = [...list];
    sortSources(list, "name", "en");
    expect(list).toEqual(copy);
  });
});
