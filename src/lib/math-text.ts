/**
 * Tokeniser for "Markdown + LaTeX" card content. Splits `$$…$$` (display) and `$…$` (inline) out of prose so the
 * UI can render math with KaTeX and everything else as plain React text (never as raw HTML).
 */

export type MathToken = { type: "text"; value: string } | { type: "inline" | "block"; value: string };

// `$$ … $$` (may span lines) | `$ … $` (single line; opening `$` not followed by a space, closing not followed by a digit,
// so prices like "$5 and $10" are left alone). `\$` is an escaped dollar sign.
const MATH = /\$\$([\s\S]+?)\$\$|(?<![\\$])\$(?![\s$])((?:\\.|[^$\\\n])+?)(?<![\s\\])\$(?![\d$])/g;

export function tokenizeMath(input: string): MathToken[] {
  const tokens: MathToken[] = [];
  let last = 0;
  for (const match of input.matchAll(MATH)) {
    const index = match.index ?? 0;
    if (index > last) tokens.push({ type: "text", value: input.slice(last, index) });
    if (match[1] !== undefined) tokens.push({ type: "block", value: match[1].trim() });
    else tokens.push({ type: "inline", value: match[2] });
    last = index + match[0].length;
  }
  if (last < input.length) tokens.push({ type: "text", value: input.slice(last) });
  return tokens.map((t) => (t.type === "text" ? { ...t, value: t.value.replaceAll("\\$", "$") } : t));
}

export type InlineToken = { type: "text" | "bold" | "italic" | "code"; value: string };

/** Minimal inline Markdown for prose segments: **bold**, *italic*, `code`. Anything else stays literal text. */
export function tokenizeInline(input: string): InlineToken[] {
  const out: InlineToken[] = [];
  const re = /\*\*([^*\n]+)\*\*|(?<![*\w])\*([^*\n]+)\*(?![*\w])|`([^`\n]+)`/g;
  let last = 0;
  for (const m of input.matchAll(re)) {
    const index = m.index ?? 0;
    if (index > last) out.push({ type: "text", value: input.slice(last, index) });
    if (m[1] !== undefined) out.push({ type: "bold", value: m[1] });
    else if (m[2] !== undefined) out.push({ type: "italic", value: m[2] });
    else out.push({ type: "code", value: m[3] });
    last = index + m[0].length;
  }
  if (last < input.length) out.push({ type: "text", value: input.slice(last) });
  return out;
}
