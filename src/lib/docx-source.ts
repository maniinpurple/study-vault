/**
 * Browser-only: turns a .docx into page canvases. mammoth converts the document to HTML (text, headings, lists, tables,
 * embedded pictures); that HTML is sanitised, laid out in A4 pages and rasterised, so the rest of the app (viewer,
 * snip tool, stitching) sees ordinary page images. Word equations (OMML) are not supported by mammoth and are dropped.
 */
import { MAX_DOCX_PAGES, PAGE_CONTENT_HEIGHT, PAGE_CONTENT_WIDTH, PAGE_HEIGHT, PAGE_PADDING_X, PAGE_PADDING_Y, PAGE_WIDTH, paginateBlocks, RASTER_SCALE } from "@/lib/docx-layout";

export class DocxError extends Error {
  constructor(readonly code: "UNREADABLE" | "TOO_MANY_PAGES") {
    super(code);
    this.name = "DocxError";
  }
}

const KEEP = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "LI", "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH", "STRONG", "B", "EM", "I", "U", "S", "SUB", "SUP", "BR", "BLOCKQUOTE", "IMG", "CAPTION"]);
const DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "NOSCRIPT", "TEMPLATE", "LINK", "META", "SVG", "MATH", "FORM", "INPUT"]);

/** Rebuild `source`'s children under `target` keeping only known formatting tags (no links, handlers or styles). */
function copyClean(source: Node, target: Node, doc: Document): void {
  source.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) return void target.appendChild(doc.createTextNode(node.textContent ?? ""));
    if (!(node instanceof Element) || DROP.has(node.tagName)) return;
    if (!KEEP.has(node.tagName)) return copyClean(node, target, doc); // unwrap (spans, links, …): keep the text
    const clean = doc.createElement(node.tagName.toLowerCase());
    if (node instanceof HTMLImageElement) {
      const src = node.getAttribute("src") ?? "";
      if (!/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(src)) return; // only pictures embedded in the file
      clean.setAttribute("src", src);
      clean.setAttribute("alt", "");
    }
    for (const attr of ["colspan", "rowspan"]) if (node.hasAttribute(attr) && /^\d{1,2}$/.test(node.getAttribute(attr) ?? "")) clean.setAttribute(attr, node.getAttribute(attr)!);
    copyClean(node, clean, doc);
    target.appendChild(clean);
  });
}

const PAGE_CSS = `
.vl-docx{box-sizing:border-box;background:#fff;color:#111;font:15px/1.55 "Times New Roman",Times,"Noto Serif",serif;overflow:hidden}
.vl-docx *{box-sizing:border-box}
.vl-docx>*{margin:0 0 12px}
.vl-docx h1{font-size:24px;line-height:1.25}.vl-docx h2{font-size:20px;line-height:1.3}.vl-docx h3,.vl-docx h4,.vl-docx h5,.vl-docx h6{font-size:16px}
.vl-docx p{margin:0}.vl-docx ul,.vl-docx ol{padding-left:28px;margin:0}
.vl-docx table{border-collapse:collapse;width:100%}.vl-docx td,.vl-docx th{border:1px solid #777;padding:4px 6px;vertical-align:top}
.vl-docx img{display:block;max-width:100%;max-height:${PAGE_CONTENT_HEIGHT - 24}px;height:auto}
`;

async function settle(root: Element): Promise<void> {
  await Promise.all([...root.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined)));
}

/** Render a .docx to one canvas per A4 page. */
export async function renderDocxPages(file: File): Promise<HTMLCanvasElement[]> {
  let html: string;
  try {
    const mammoth = await import("mammoth");
    html = (await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() })).value;
  } catch {
    throw new DocxError("UNREADABLE");
  }

  // The parsed document is inert (no scripts run, nothing is fetched); only whitelisted nodes are copied out of it.
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const cleaned = document.createElement("div");
  copyClean(parsed.body, cleaned, document);
  const blocks = [...cleaned.children];
  if (blocks.length === 0) throw new DocxError("UNREADABLE");

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-10000px;top:0;pointer-events:none";
  const style = document.createElement("style");
  style.textContent = PAGE_CSS;
  host.appendChild(style);
  document.body.appendChild(host);

  try {
    // Measure every block at the real content width, then decide which blocks share a page.
    const measure = document.createElement("div");
    measure.className = "vl-docx";
    measure.style.cssText = `width:${PAGE_CONTENT_WIDTH}px`;
    blocks.forEach((block) => measure.appendChild(block.cloneNode(true)));
    host.appendChild(measure);
    await settle(measure);
    const heights = [...measure.children].map((el) => el.getBoundingClientRect().height + 12);
    measure.remove();

    const layout = paginateBlocks(heights);
    if (layout.length > MAX_DOCX_PAGES) throw new DocxError("TOO_MANY_PAGES");

    const { default: html2canvas } = await import("html2canvas-pro");
    const canvases: HTMLCanvasElement[] = [];
    for (const indices of layout) {
      const page = document.createElement("div");
      page.className = "vl-docx";
      page.style.cssText = `width:${PAGE_WIDTH}px;height:${PAGE_HEIGHT}px;padding:${PAGE_PADDING_Y}px ${PAGE_PADDING_X}px`;
      indices.forEach((i) => page.appendChild(blocks[i].cloneNode(true)));
      host.appendChild(page);
      await settle(page);
      canvases.push(await html2canvas(page, { scale: RASTER_SCALE, backgroundColor: "#ffffff", logging: false }));
      page.remove();
    }
    return canvases;
  } finally {
    host.remove();
  }
}
