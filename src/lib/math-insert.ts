/**
 * Pure helpers behind the Math Pad: the quick-insert templates, wrapping a formula in `$…$` / `$$…$$`, and splicing text into a
 * field at its caret. The DOM wiring lives in `math-pad.tsx`.
 */

export type MathGroup = "structure" | "calculus" | "relations" | "greek" | "matrices";

export interface MathKey {
  /** Key of `t.mathpad.keys` for the accessible name, or null when the LaTeX command itself is the name (symbols, Greek). */
  nameKey: string | null;
  /** The LaTeX inserted. */
  latex: string;
  /** Where the caret lands afterwards, counted from the start of `latex` (default: the end), e.g. inside the first `{}`. */
  caret?: number;
  /** What the button shows, as LaTeX (default: `latex`). */
  face?: string;
  group: MathGroup;
}

const sym = (latex: string, group: MathGroup): MathKey => ({ nameKey: null, latex, group });

const PMATRIX_2 = "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}";
const PMATRIX_3 = "\\begin{pmatrix} a & b & c \\\\ d & e & f \\\\ g & h & i \\end{pmatrix}";
const CASES = "\\begin{cases} x + y = 1 \\\\ x - y = 0 \\end{cases}";

export const MATH_KEYS: readonly MathKey[] = [
  { nameKey: "fraction", latex: "\\frac{}{}", caret: 6, face: "\\frac{a}{b}", group: "structure" },
  { nameKey: "sqrt", latex: "\\sqrt{}", caret: 6, face: "\\sqrt{x}", group: "structure" },
  { nameKey: "nthRoot", latex: "\\sqrt[]{}", caret: 6, face: "\\sqrt[n]{x}", group: "structure" },
  { nameKey: "power", latex: "^{}", caret: 2, face: "x^{n}", group: "structure" },
  { nameKey: "subscript", latex: "_{}", caret: 2, face: "x_{n}", group: "structure" },
  { nameKey: "parens", latex: "\\left(  \\right)", caret: 7, face: "\\left(x\\right)", group: "structure" },
  { nameKey: "abs", latex: "\\left|  \\right|", caret: 7, face: "\\left|x\\right|", group: "structure" },

  { nameKey: "integral", latex: "\\int_{}^{} \\,dx", caret: 6, face: "\\int_{a}^{b}", group: "calculus" },
  { nameKey: "sum", latex: "\\sum_{i=1}^{n}", face: "\\sum", group: "calculus" },
  { nameKey: "limit", latex: "\\lim_{x \\to }", caret: 12, face: "\\lim", group: "calculus" },
  { nameKey: "derivative", latex: "\\frac{d}{dx}", group: "calculus" },
  { nameKey: "infinity", latex: "\\infty", group: "calculus" },

  ...["\\le", "\\ge", "\\ne", "\\approx", "<", ">", "\\in", "\\subset", "\\Rightarrow", "\\Leftrightarrow", "\\pm", "\\cdot", "\\times", "\\div"].map((latex) => sym(latex, "relations")),

  ...["\\alpha", "\\beta", "\\gamma", "\\delta", "\\varepsilon", "\\theta", "\\lambda", "\\mu", "\\pi", "\\sigma", "\\varphi", "\\omega", "\\Delta", "\\Sigma", "\\Omega"].map((latex) => sym(latex, "greek")),

  { nameKey: "matrix2", latex: PMATRIX_2, group: "matrices" },
  { nameKey: "matrix3", latex: PMATRIX_3, group: "matrices" },
  { nameKey: "cases", latex: CASES, group: "matrices" },
];

/** `$…$` (inline) or `$$…$$` (display) around a formula, or an empty string when there is no formula. */
export function wrapLatex(latex: string, display: boolean): string {
  const body = latex.trim();
  if (!body) return "";
  return display ? `$$${body}$$` : `$${body}$`;
}

/** `insert` placed over the selection `[start, end)` of `value`; `caret` is where the cursor goes (default: after the insert). */
export function spliceText(value: string, start: number, end: number, insert: string, caret?: number): { value: string; caret: number } {
  const from = Math.max(0, Math.min(start, value.length));
  const to = Math.max(from, Math.min(end, value.length));
  return { value: value.slice(0, from) + insert + value.slice(to), caret: from + Math.max(0, Math.min(caret ?? insert.length, insert.length)) };
}
