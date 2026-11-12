import { describe, expect, it } from "vitest";

import { tokenizeInline, tokenizeMath } from "@/lib/math-text";

describe("tokenizeMath", () => {
  it("splits inline and display math from prose", () => {
    expect(tokenizeMath("Tính $x^2$ rồi $$\\int_0^1 f$$ xong")).toEqual([
      { type: "text", value: "Tính " },
      { type: "inline", value: "x^2" },
      { type: "text", value: " rồi " },
      { type: "block", value: "\\int_0^1 f" },
      { type: "text", value: " xong" },
    ]);
  });
  it("supports multi-line display math and escaped brackets inside inline math", () => {
    const tokens = tokenizeMath("$$\n\\begin{cases}a\\\\b\\end{cases}\n$$ và $\\{0,1\\}$");
    expect(tokens[0]).toEqual({ type: "block", value: "\\begin{cases}a\\\\b\\end{cases}" });
    expect(tokens[2]).toEqual({ type: "inline", value: "\\{0,1\\}" });
  });
  it("leaves prices and escaped dollars as text", () => {
    expect(tokenizeMath("It costs $5 and $10 today")).toEqual([{ type: "text", value: "It costs $5 and $10 today" }]);
    expect(tokenizeMath("pay \\$3 now")).toEqual([{ type: "text", value: "pay $3 now" }]);
  });
  it("does not run an unterminated dollar across lines", () => {
    expect(tokenizeMath("a $b\nc$ d").every((t) => t.type === "text")).toBe(true);
  });
});

describe("tokenizeInline", () => {
  it("handles bold, italic and code but keeps stray asterisks literal", () => {
    expect(tokenizeInline("a **b** *c* `d`")).toEqual([
      { type: "text", value: "a " },
      { type: "bold", value: "b" },
      { type: "text", value: " " },
      { type: "italic", value: "c" },
      { type: "text", value: " " },
      { type: "code", value: "d" },
    ]);
    expect(tokenizeInline("2 * 3 = 6")).toEqual([{ type: "text", value: "2 * 3 = 6" }]);
  });
});
