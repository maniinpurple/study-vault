/**
 * The appearance system's accessibility and isolation contract (DESIGN_SYSTEM.md §2, §4): every text/surface pair of every style, in
 * both modes, and of every accent colour a user can pick, clears WCAG 2.2 AA; and a style's CSS only ever sets its own variables.
 * The look is free to change; the contrast is not negotiable.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ACCENT_PRESETS,
  APPEARANCE_KEYS,
  DEFAULT_ACCENT,
  DEFAULT_LAYOUT,
  DEFAULT_STYLE,
  NAV_LAYOUTS,
  THEME_STYLES,
  accentCss,
  bootScript,
  deriveAccentTokens,
  deriveAccentVars,
  isNavLayout,
  isThemeStyle,
  normalizeHex,
  parseAccentVars,
  surfaceWithinLimit,
  type AccentTokens,
  type Mode,
} from "@/lib/appearance";
import { contrastRatio, oklchToRgb, parseColor, parseHex, parseOklch, rgbToHex, rgbToOklch, type Rgb } from "@/lib/color";

const css = readFileSync(fileURLToPath(new URL("../src/app/globals.css", import.meta.url)), "utf8");
const MODES: readonly Mode[] = ["light", "dark"];

function block(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start, `${selector} is missing from globals.css`).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf("}", start));
}

function tokens(selector: string): Map<string, Rgb> {
  const out = new Map<string, Rgb>();
  for (const [, name, value] of block(selector).matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6}|oklch\([^)]*\));/g)) {
    const color = parseColor(value);
    if (!color) continue;
    expect(color.inGamut, `${selector} --${name} is outside sRGB`).toBe(true);
    out.set(name, color.rgb);
  }
  return out;
}

const accentDefaults: Record<Mode, Map<string, Rgb>> = { light: tokens('html[data-mode="light"]'), dark: tokens('html[data-mode="dark"]') };
const stylePalettes = THEME_STYLES.flatMap((style) =>
  MODES.map((mode) => {
    const own = tokens(`[data-theme="${style}"][data-mode="${mode}"]`);
    return { style: style as string, mode, tokens: new Map([...accentDefaults[mode], ...own]), own };
  }),
);
/** The interface mode "Ultra-minimal" brings a complete palette of its own, so it is held to the same contract as a style. */
const ultraPalettes = MODES.map((mode) => {
  const own = tokens(`html[data-ui-mode="ultra-minimal"][data-mode="${mode}"]`);
  return { style: "ultra-minimal", mode, tokens: new Map([...accentDefaults[mode], ...own]), own };
});
const palettes = [...stylePalettes, ...ultraPalettes];

const SURFACES = ["background", "card", "sunken", "popover"];
const PAIRS: [string, string[], number][] = [
  ["foreground", SURFACES, 7],
  ["muted-foreground", SURFACES, 4.5],
  ["subtle-foreground", SURFACES, 4.5],
  ["brand", SURFACES, 4.5],
  ["background", ["brand"], 4.5], // text on a brand-coloured fill
  ["accent-foreground", ["accent"], 4.5],
  ["foreground", ["accent"], 7],
  ["brand", ["accent"], 4.5],
  ["primary-foreground", ["primary"], 4.5], // button labels on the accent fill
  ["mark-foreground", ["mark-soft"], 4.5],
  ["success", ["background", "card", "success-soft"], 4.5],
  ["warning", ["background", "card", "warning-soft"], 4.5],
  ["destructive", ["background", "card", "destructive-soft"], 4.5],
  ["input", ["background", "card"], 3], // the outline of a form control
];

describe("color math", () => {
  it("converts OKLCH and hex to sRGB and measures WCAG contrast", () => {
    expect(rgbToHex(oklchToRgb(1, 0, 0).rgb)).toBe("#FFFFFF");
    expect(rgbToHex(oklchToRgb(0, 0, 0).rgb)).toBe("#000000");
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21, 5);
    expect(parseOklch("oklch(0.966 0.014 88)")).toEqual([0.966, 0.014, 88]);
    expect(parseOklch("#fff")).toBeNull();
    expect(parseHex("#49B6E5")).toEqual([73, 182, 229]);
    expect(parseHex("49B6E5")).toBeNull();
    expect(parseColor("#111827")?.rgb).toEqual([17, 24, 39]);
    expect(parseColor("rgb(1,2,3)")).toBeNull();
  });
  it("round-trips sRGB through OKLCH", () => {
    for (const rgb of [[76, 154, 255], [61, 190, 122], [240, 96, 93], [17, 24, 39], [250, 250, 250]] as Rgb[]) {
      const [l, c, h] = rgbToOklch(rgb);
      const back = oklchToRgb(l, c, h).rgb;
      rgb.forEach((channel, i) => expect(Math.abs(back[i] - channel)).toBeLessThanOrEqual(1));
    }
    expect(rgbToOklch([255, 255, 255])[0]).toBeCloseTo(1, 3);
  });
});

describe("style palettes", () => {
  it("ships every style in both modes with the same set of tokens", () => {
    const reference = [...palettes[0].own.keys()].sort();
    expect(reference.length).toBeGreaterThanOrEqual(19);
    for (const palette of palettes) expect([...palette.own.keys()].sort(), `${palette.style} ${palette.mode}`).toEqual(reference);
  });

  it("keeps the skills' own tokens where a skill defined them", () => {
    const get = (style: string, mode: Mode, name: string) => rgbToHex(palettes.find((p) => p.style === style && p.mode === mode)!.tokens.get(name)!);
    expect(get("doodle", "light", "foreground")).toBe("#111827");
    expect(get("doodle", "light", "card")).toBe("#FFFFFF");
    expect(get("tetris", "light", "background")).toBe("#DFE7FF"); // surface
    expect(get("tetris", "light", "foreground")).toBe("#1C398E"); // text
    expect(get("tetris", "light", "border")).toBe("#1C202B"); // primary ink
  });

  describe.each(palettes)("$style / $mode", ({ style, mode, tokens: all }) => {
    it("keeps surfaces within the limits the accent derivation relies on, and never a pure white or black page", () => {
      for (const surface of SURFACES) expect(surfaceWithinLimit(mode, all.get(surface)!), `${style} ${mode} ${surface}`).toBe(true);
      // Ultra-minimal is the one look whose page is deliberately pure white / near-black.
      if (style !== "ultra-minimal") expect(rgbToHex(all.get("background")!)).not.toMatch(/^#(FFFFFF|000000)$/);
    });
    it.each(PAIRS)("%s clears its contrast target", (text, surfaces, min) => {
      for (const surface of surfaces) expect(contrastRatio(all.get(text)!, all.get(surface)!), `${text} on ${surface}`).toBeGreaterThanOrEqual(min);
    });
  });
});

describe("accent derivation", () => {
  const sweep = [...ACCENT_PRESETS.map((p) => p.hex), "#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#808080", "#ffff00", "#ff00ff", "#00ffff", "#7f7f00", "#102030", "#f0f0e0"];

  it("is already in the stylesheet for the default accent (blue), in both modes", () => {
    const expected = deriveAccentVars(DEFAULT_ACCENT);
    for (const mode of MODES) {
      const own = accentDefaults[mode];
      for (const [name, key] of [["primary", "primary"], ["primary-foreground", "primaryForeground"], ["brand", "brand"], ["brand-hover", "brandHover"], ["accent", "accent"], ["accent-foreground", "accentForeground"]] as const) {
        expect(rgbToHex(own.get(name)!).toLowerCase(), `${mode} ${name}`).toBe(expected[mode][key]);
      }
    }
  });

  it.each(sweep)("%s clears AA on every style and mode", (color) => {
    for (const palette of palettes) {
      const derived = deriveAccentTokens(color, palette.mode);
      const t = (name: keyof AccentTokens) => parseHex(derived[name])!;
      const where = `${color} on ${palette.style} ${palette.mode}`;
      for (const surface of SURFACES) expect(contrastRatio(t("brand"), palette.tokens.get(surface)!), `brand on ${surface}, ${where}`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette.tokens.get("background")!, t("brand")), `background on brand, ${where}`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t("primaryForeground"), t("primary")), `label on primary, ${where}`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(palette.tokens.get("foreground")!, t("accent")), `foreground on accent, ${where}`).toBeGreaterThanOrEqual(7);
      expect(contrastRatio(t("accentForeground"), t("accent")), `accent label, ${where}`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t("brand"), t("accent")), `brand on accent, ${where}`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t("brandHover"), palette.tokens.get("card")!), `hover on card, ${where}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the picked colour as the primary fill", () => {
    for (const color of sweep) for (const mode of MODES) expect(deriveAccentTokens(color, mode).primary).toBe(color);
  });
});

describe("appearance helpers", () => {
  it("normalizes colours and validates the choices", () => {
    expect(normalizeHex(" #ABC ")).toBe("#aabbcc");
    expect(normalizeHex("#4C9AFF")).toBe("#4c9aff");
    expect(normalizeHex("blue")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
    expect(isThemeStyle("tetris")).toBe(true);
    expect(isThemeStyle("neon")).toBe(false);
    expect(isNavLayout("topbar")).toBe(true);
    expect(isNavLayout("left")).toBe(false);
    expect(DEFAULT_STYLE).toBe("minimal");
    expect(DEFAULT_LAYOUT).toBe("sidebar");
    expect(DEFAULT_ACCENT).toBe(ACCENT_PRESETS[0].hex);
    expect(ACCENT_PRESETS.map((p) => p.id)).toEqual(["blue", "green", "red", "purple", "orange"]);
  });

  it("builds a stylesheet that only touches accent variables, and parses stored tokens strictly", () => {
    const vars = deriveAccentVars("#9b6bff");
    const sheet = accentCss(vars);
    for (const mode of MODES) expect(sheet).toContain(`html[data-theme][data-mode="${mode}"]{--primary:#9b6bff;`);
    const declared = [...sheet.matchAll(/(--[\w-]+):/g)].map((m) => m[1]);
    expect(new Set(declared)).toEqual(new Set(["--primary", "--primary-foreground", "--brand", "--brand-hover", "--accent", "--accent-foreground"]));
    expect(parseAccentVars(JSON.parse(JSON.stringify(vars)))).toEqual(vars);
    expect(parseAccentVars({ light: vars.light })).toBeNull();
    expect(parseAccentVars({ light: { ...vars.light, brand: "red; } body { display: none" }, dark: vars.dark })).toBeNull();
    expect(parseAccentVars(null)).toBeNull();
  });
});

describe("boot script (runs before first paint)", () => {
  function run(stored: Record<string, string>) {
    const root = { dataset: {} as Record<string, string>, lang: "" };
    const appended: { id: string; textContent: string }[] = [];
    const document = {
      documentElement: root,
      head: { appendChild: (el: { id: string; textContent: string }) => appended.push(el) },
      createElement: () => ({ id: "", textContent: "" }),
    };
    const localStorage = { getItem: (key: string) => stored[key] ?? null };
    new Function("document", "localStorage", bootScript("vl:prefs"))(document, localStorage);
    return { root, appended };
  }

  it("restores the interface mode, and ignores an unknown one", () => {
    expect(run({ [APPEARANCE_KEYS.uiMode]: "ultra-minimal" }).root.dataset.uiMode).toBe("ultra-minimal");
    expect(run({ [APPEARANCE_KEYS.uiMode]: "brutal" }).root.dataset.uiMode).toBeUndefined();
  });

  it("restores mode, language, style, layout and accent from localStorage", () => {
    const vars = deriveAccentVars("#f0605d");
    const { root, appended } = run({
      "vl:prefs": JSON.stringify({ theme: "dark", lang: "en" }),
      [APPEARANCE_KEYS.style]: "brutalism",
      [APPEARANCE_KEYS.layout]: "topbar",
      [APPEARANCE_KEYS.accentVars]: JSON.stringify(vars),
    });
    expect(root.dataset).toMatchObject({ mode: "dark", theme: "brutalism", layout: "topbar" });
    expect(root.lang).toBe("en");
    expect(appended).toHaveLength(1);
    expect(appended[0].id).toBe("vl-accent");
    expect(appended[0].textContent).toBe(accentCss(vars));
  });

  it("ignores unknown or tampered values", () => {
    const { root, appended } = run({
      [APPEARANCE_KEYS.style]: "javascript:alert(1)",
      [APPEARANCE_KEYS.layout]: "diagonal",
      [APPEARANCE_KEYS.accentVars]: JSON.stringify({ light: { primary: "red; } *{display:none" } }),
    });
    expect(root.dataset.theme).toBeUndefined();
    expect(root.dataset.layout).toBeUndefined();
    expect(appended).toHaveLength(0);
  });

  it("does nothing, and does not throw, with empty storage", () => {
    const { root, appended } = run({});
    expect(root.dataset).toEqual({});
    expect(appended).toHaveLength(0);
  });
});

describe("globals.css isolation", () => {
  it("Ultra-minimal: pure canvas (#FFFFFF light, #0A0A0A dark) and only variables in its structure block", () => {
    expect(rgbToHex(ultraPalettes[0].own.get("background")!)).toBe("#FFFFFF");
    expect(rgbToHex(ultraPalettes[1].own.get("background")!)).toBe("#0A0A0A");
    for (const selector of ['html[data-ui-mode="ultra-minimal"]', 'html[data-ui-mode="ultra-minimal"][data-mode="light"]', 'html[data-ui-mode="ultra-minimal"][data-mode="dark"]']) {
      const body = block(selector).split("{")[1];
      for (const declaration of body.split(/;\s*\n/).map((d) => d.trim()).filter(Boolean)) expect(declaration.startsWith("--"), `${selector}: ${declaration}`).toBe(true);
    }
  });

  it("scopes every ultra-minimal element rule to the attribute (or to its own helper classes)", () => {
    const selectors = [...css.matchAll(/^(html\[data-ui-mode="ultra-minimal"\][^{\n]*|\.vl-(?:ultra-only|split)[^{\n]*) \{/gm)].map((m) => m[1]);
    expect(selectors.length).toBeGreaterThan(10);
    for (const selector of selectors) expect(selector, selector).toMatch(/^(html\[data-ui-mode="ultra-minimal"\]|\.vl-ultra-only|\.vl-split)/);
  });

  it("lists every style and layout the app offers", () => {
    expect(THEME_STYLES).toEqual(["minimal", "doodle", "cafe", "brutalism", "stitch", "retro", "tetris"]);
    expect(NAV_LAYOUTS).toEqual(["sidebar", "topbar"]);
  });

  it("scopes every style's own rule to its data-theme and sets only variables there", () => {
    for (const style of THEME_STYLES) {
      const pattern = new RegExp(`^\\[data-theme="${style}"\\](?:\\[data-mode="(?:light|dark)"\\])? \\{`, "gm");
      const rules = [...css.matchAll(pattern)];
      expect(rules.length, style).toBeGreaterThanOrEqual(style === "minimal" ? 2 : 3);
      for (const rule of rules) {
        const body = css.slice(rule.index, css.indexOf("}", rule.index)).split("{")[1];
        for (const declaration of body.split(/;\s*\n/).map((d) => d.trim()).filter(Boolean)) expect(declaration.startsWith("--"), `${style}: ${declaration}`).toBe(true);
      }
    }
  });

  it("only restyles elements outside a style's own variables for Doodle's corners and the square styles' badges", () => {
    const selectors = [...css.matchAll(/^(\[data-theme="[a-z]+"\][^{\n]*[^\s{]) \{/gm)].map((m) => m[1]).filter((selector) => /\] [.\[a-z]/.test(selector));
    for (const selector of selectors) expect(selector, selector).toMatch(/^\[data-theme="(doodle|brutalism|retro|tetris)"\] (\.rounded-(sm|md|lg|xl|2xl)|\[data-slot="badge"\])/);
  });

  it("uses one clean sans-serif stack for every language: no handwriting, display or cursive faces", () => {
    expect(css).not.toMatch(/delius|itim|bangers|comic|cursive|font-doodle|ui-rounded/i);
    const sans = /--font-sans:\s*([^;]+);/.exec(css)![1];
    expect(sans).toContain("var(--font-inter)");
    expect(sans).toContain("sans-serif");
    for (const role of ["serif", "heading"]) expect(css).toContain(`--font-${role}: var(--font-sans);`);
    expect(css).not.toMatch(/html:lang\(/);
    const layout = readFileSync(fileURLToPath(new URL("../src/app/layout.tsx", import.meta.url)), "utf8");
    expect(layout).not.toMatch(/Delius|Itim|Bangers/);
    expect(layout).toMatch(/subsets:\s*\["latin",\s*"vietnamese"\]/);
  });
});
