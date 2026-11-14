/** The contrast table in DESIGN_SYSTEM.md §2.3, checked against the tokens actually shipped in globals.css. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { contrastRatio, oklchToRgb, parseOklch, rgbToHex, type Rgb } from "@/lib/color";

const css = readFileSync(fileURLToPath(new URL("../src/app/globals.css", import.meta.url)), "utf8");

function tokens(selector: string): Map<string, Rgb> {
  const start = css.indexOf(selector);
  const block = css.slice(start, css.indexOf("}", start));
  const out = new Map<string, Rgb>();
  for (const [, name, value] of block.matchAll(/--([\w-]+):\s*(oklch\([^)]*\));/g)) {
    const lch = parseOklch(value);
    if (!lch) continue;
    const { rgb, inGamut } = oklchToRgb(...lch);
    expect(inGamut, `${selector} --${name} is outside sRGB`).toBe(true);
    out.set(name, rgb);
  }
  return out;
}

const themes = { light: tokens('[data-theme="light"] {'), dark: tokens('[data-theme="dark"] {') };
const SURFACES = ["background", "card", "sunken", "popover"];
const PAIRS: [string, string[], number][] = [
  ["foreground", SURFACES, 7],
  ["muted-foreground", SURFACES, 4.5],
  ["subtle-foreground", SURFACES, 4.5],
  ["background", ["foreground"], 7],
  ["brand", ["background", "card", "sunken"], 4.5],
  ["accent-foreground", ["accent"], 4.5],
  ["mark-foreground", ["mark-soft"], 4.5],
  ["success", ["background", "success-soft"], 4.5],
  ["warning", ["background", "warning-soft"], 4.5],
  ["destructive", ["background", "destructive-soft"], 4.5],
  ["input", ["background", "card"], 3],
];

describe("color math", () => {
  it("converts OKLCH to sRGB and measures WCAG contrast", () => {
    expect(rgbToHex(oklchToRgb(1, 0, 0).rgb)).toBe("#FFFFFF");
    expect(rgbToHex(oklchToRgb(0, 0, 0).rgb)).toBe("#000000");
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 5);
    expect(parseOklch("oklch(0.966 0.014 88)")).toEqual([0.966, 0.014, 88]);
    expect(parseOklch("#fff")).toBeNull();
  });
});

describe.each(Object.entries(themes))("%s theme tokens", (_name, theme) => {
  it("defines every color token", () => {
    expect(theme.size).toBeGreaterThanOrEqual(23);
    expect(rgbToHex(theme.get("background")!)).not.toMatch(/^#(FFFFFF|000000)$/);
  });
  it.each(PAIRS)("%s clears its contrast target", (text, surfaces, min) => {
    for (const surface of surfaces) expect(contrastRatio(theme.get(text)!, theme.get(surface)!), `${text} on ${surface}`).toBeGreaterThanOrEqual(min);
  });
});
