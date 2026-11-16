import katex from "katex";
import { describe, expect, it } from "vitest";

import { MATH_KEYS, spliceText, wrapLatex } from "@/lib/math-insert";

describe("wrapLatex", () => {
  it("wraps in $…$ or $$…$$ and trims", () => {
    expect(wrapLatex(" \\frac{a}{b} ", false)).toBe("$\\frac{a}{b}$");
    expect(wrapLatex("x^2", true)).toBe("$$x^2$$");
    expect(wrapLatex("   ", false)).toBe("");
  });
});

describe("spliceText", () => {
  it("replaces the selection and puts the caret after the insert", () => {
    expect(spliceText("hello world", 6, 11, "$x$")).toEqual({ value: "hello $x$", caret: 9 });
    expect(spliceText("ab", 1, 1, "X")).toEqual({ value: "aXb", caret: 2 });
  });
  it("places the caret inside a template when asked, and clamps bad ranges", () => {
    expect(spliceText("", 0, 0, "\\frac{}{}", 6)).toEqual({ value: "\\frac{}{}", caret: 6 });
    expect(spliceText("abc", 99, 120, "Z")).toEqual({ value: "abcZ", caret: 4 });
    expect(spliceText("abc", 2, 1, "Z")).toEqual({ value: "abZc", caret: 3 });
    expect(spliceText("abc", 0, 0, "Z", 99).caret).toBe(1);
  });
});

describe("quick-insert keys", () => {
  it("cover every structure the Math Pad promises", () => {
    const names = new Set(MATH_KEYS.map((k) => k.nameKey));
    for (const key of ["fraction", "sqrt", "power", "integral", "sum", "limit", "matrix2", "matrix3"]) expect(names.has(key), key).toBe(true);
    const groups = new Set(MATH_KEYS.map((k) => k.group));
    expect([...groups].sort()).toEqual(["calculus", "greek", "matrices", "relations", "structure"]);
    expect(MATH_KEYS.filter((k) => k.group === "greek").length).toBeGreaterThanOrEqual(10);
  });

  it("keep the caret inside the template, on an empty slot", () => {
    for (const key of MATH_KEYS) {
      if (key.caret === undefined) continue;
      expect(key.caret, key.latex).toBeLessThanOrEqual(key.latex.length);
    }
    // The fraction's caret sits between the numerator's braces.
    const fraction = MATH_KEYS.find((k) => k.nameKey === "fraction")!;
    expect(fraction.latex.slice(fraction.caret! - 1, fraction.caret! + 1)).toBe("{}");
  });

  it("render in KaTeX: the face and the LaTeX that is inserted", () => {
    for (const key of MATH_KEYS) {
      for (const source of [key.face ?? key.latex, key.latex]) expect(() => katex.renderToString(source, { throwOnError: true, strict: "ignore" }), source).not.toThrow();
    }
  });
});
