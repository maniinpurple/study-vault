import katex from "katex";
import * as React from "react";

import { tokenizeInline, tokenizeMath } from "@/lib/math-text";
import { cn } from "@/lib/utils";

function renderKatex(source: string, displayMode: boolean): string {
  // trust:false (default) blocks \href/\url/\includegraphics; throwOnError:false renders bad LaTeX as red source instead of crashing.
  return katex.renderToString(source, { displayMode, throwOnError: false, strict: "ignore", output: "htmlAndMathml" });
}

function Prose({ text }: { text: string }) {
  return (
    <>
      {tokenizeInline(text).map((token, i) => {
        if (token.type === "bold") return <strong key={i}>{token.value}</strong>;
        if (token.type === "italic") return <em key={i}>{token.value}</em>;
        if (token.type === "code") return <code key={i} className="tabular-nums rounded bg-muted px-1 py-0.5 text-[0.85em]">{token.value}</code>;
        return <React.Fragment key={i}>{token.value}</React.Fragment>;
      })}
    </>
  );
}

/**
 * Renders "Markdown + LaTeX" card content: `$…$` / `$$…$$` through KaTeX, light inline Markdown, everything else as
 * plain text (never raw HTML — model output is untrusted).
 */
export function MathText({ text, className }: { text: string; className?: string }) {
  const tokens = React.useMemo(() => tokenizeMath(text), [text]);
  return (
    <div className={cn("text-sm leading-relaxed break-words whitespace-pre-wrap", className)}>
      {tokens.map((token, i) => {
        if (token.type === "text") {
          // Newlines next to a display equation would add an extra blank line on top of the block's own margin.
          let value = token.value;
          if (tokens[i - 1]?.type === "block") value = value.replace(/^\n/, "");
          if (tokens[i + 1]?.type === "block") value = value.replace(/\n$/, "");
          return <Prose key={i} text={value} />;
        }
        const html = renderKatex(token.value, token.type === "block");
        return token.type === "block" ? (
          <div key={i} className="my-2 overflow-x-auto overflow-y-hidden" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
        );
      })}
    </div>
  );
}
