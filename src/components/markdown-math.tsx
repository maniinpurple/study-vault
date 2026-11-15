"use client";

import "katex/dist/katex.min.css";
import { memo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

import { cn } from "@/lib/utils";

/**
 * Markdown + LaTeX preview ($…$ inline, $$…$$ display) for text the student is editing, rendered with react-markdown,
 * remark-math and rehype-katex. Raw HTML in the text is never rendered, and a formula KaTeX cannot parse is shown as
 * its source instead of breaking the page.
 */
function MarkdownMathView({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("text-reading break-words [&_li]:my-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6", className)}>
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[[rehypeKatex, { strict: "ignore", throwOnError: false }]]}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

/** Memoized: parsing Markdown and typesetting KaTeX is expensive, and the text rarely changes between renders. */
export const MarkdownMath = memo(MarkdownMathView);
