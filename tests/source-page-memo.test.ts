import { describe, expect, it } from "vitest";

import { samePageProps, type SourcePageProps } from "@/components/sources/source-page";

const toolbar = { saveLabel: "Save", deleteLabel: "Delete", onSave() {}, onDelete() {} };
const labels = { page: (n: number) => `p${n}`, snip: (n: number) => `s${n}`, part: (n: number, p: number) => `${n}/${p}`, rendering: "…", failed: "x" };
const doc = {} as SourcePageProps["doc"];
const scrollRoot = { current: null };
const onSnip = () => {};
const onSelect = () => {};
const box = (x: number) => ({ x, y: 0.1, w: 0.2, h: 0.2 });

const props = (over: Partial<SourcePageProps> = {}): SourcePageProps => ({
  doc, page: 1, rotation: 0, scrollRoot, snips: [{ id: "a", number: 1, box: box(0.1) }], pending: [], toolbar, selectedId: null, snipMode: true, labels, onSnip, onSelect, ...over,
});

describe("SourcePage memo comparison", () => {
  it("skips a re-render when the region lists are rebuilt with the same content", () => {
    expect(samePageProps(props(), props({ snips: [{ id: "a", number: 1, box: box(0.1) }] }))).toBe(true);
  });

  it("re-renders when a region, a number or a pending part changes", () => {
    expect(samePageProps(props(), props({ snips: [{ id: "a", number: 1, box: box(0.2) }] }))).toBe(false);
    expect(samePageProps(props(), props({ snips: [{ id: "a", number: 2, box: box(0.1) }] }))).toBe(false);
    expect(samePageProps(props(), props({ snips: [] }))).toBe(false);
    expect(samePageProps(props(), props({ pending: [{ key: "k", number: 1, box: box(0.5), newest: true }] }))).toBe(false);
  });

  it("ignores the selection on pages that do not hold the selected snip, and follows it on the page that does", () => {
    expect(samePageProps(props({ selectedId: null }), props({ selectedId: "other" }))).toBe(true);
    expect(samePageProps(props({ selectedId: null }), props({ selectedId: "a" }))).toBe(false);
    expect(samePageProps(props({ selectedId: "a" }), props({ selectedId: null }))).toBe(false);
  });

  it("re-renders when anything compared by identity changes", () => {
    expect(samePageProps(props(), props({ toolbar: { ...toolbar } }))).toBe(false);
    expect(samePageProps(props(), props({ snipMode: false }))).toBe(false);
    expect(samePageProps(props(), props({ labels: { ...labels } }))).toBe(false);
    expect(samePageProps(props(), props({ onSnip: () => {} }))).toBe(false);
    expect(samePageProps(props(), props({ page: 2 }))).toBe(false);
    expect(samePageProps(props(), props({ rotation: 1 }))).toBe(false);
  });
});
