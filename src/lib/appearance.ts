/**
 * App appearance (DESIGN_SYSTEM.md §2): three independent, per-device choices kept in localStorage.
 *
 *  - style  → `data-theme` on <html>: the look (shape, outline, shadow, paper, palette). One CSS namespace per style.
 *  - accent → derived CSS variables (`--primary`, `--brand`, …) injected as one <style> element, for light and dark.
 *  - layout → `data-layout` on <html>: sidebar or top navigation bar.
 *
 * Light / dark is a fourth, account-level setting (`User.theme`) and lives on `data-mode`, so a style never has to know
 * which mode it is in. Pure: the accent maths is unit-tested to hold WCAG AA on every style in both modes.
 */
import { contrastRatio, oklchToRgb, parseHex, relativeLuminance, rgbToHex, rgbToOklch, type Rgb } from "@/lib/color";

export const THEME_STYLES = ["minimal", "doodle", "cafe", "brutalism", "stitch", "retro", "tetris"] as const;
export type ThemeStyle = (typeof THEME_STYLES)[number];
export const DEFAULT_STYLE: ThemeStyle = "minimal";

export const NAV_LAYOUTS = ["sidebar", "topbar"] as const;
export type NavLayout = (typeof NAV_LAYOUTS)[number];
export const DEFAULT_LAYOUT: NavLayout = "sidebar";

/** The interface mode: the full interface, or the typography-only "Ultra-minimal" (zero-chrome) one. */
export const UI_MODES = ["standard", "ultra-minimal"] as const;
export type UiMode = (typeof UI_MODES)[number];
export const DEFAULT_UI_MODE: UiMode = "standard";

export const APPEARANCE_KEYS = {
  uiMode: "vl:ui-mode",
  style: "vl:theme-style",
  layout: "vl:layout",
  /** The chosen accent as `#rrggbb`. */
  accent: "vl:accent",
  /** The derived tokens for it (so the pre-hydration script needs no colour maths). */
  accentVars: "vl:accent-vars",
} as const;

export const ACCENT_PRESETS = [
  { id: "blue", hex: "#4c9aff" },
  { id: "green", hex: "#3dbe7a" },
  { id: "red", hex: "#f0605d" },
  { id: "purple", hex: "#9b6bff" },
  { id: "orange", hex: "#ff9a3d" },
] as const;
export type AccentPresetId = (typeof ACCENT_PRESETS)[number]["id"];
export const DEFAULT_ACCENT: string = ACCENT_PRESETS[0].hex;

export type Mode = "light" | "dark";

/**
 * Every style keeps its surfaces (background, sunken, card, popover) at least this light in Light mode and at most this dark
 * in Dark mode (enforced by tests/design-tokens.test.ts). That lets the accent be derived once, with no knowledge of the style,
 * and still clear 4.5:1 on all of them.
 */
export const SURFACE_LIMIT: Record<Mode, Rgb> = { light: [204, 204, 204], dark: [46, 52, 70] };
const INK: Record<Mode, string> = { light: "#111827", dark: "#f4f1e8" };
const DARK_LABEL: Rgb = [17, 24, 39];
/** The weakest body-text colour any style uses per mode (Tetris light, Cafe dark): the accent tint must keep these at ≥ 7:1 too. */
const WEAKEST_FOREGROUND: Record<Mode, Rgb> = { light: [28, 57, 142], dark: [243, 231, 216] };
const TINT_BASE: Record<Mode, Rgb> = { light: [255, 255, 255], dark: [27, 36, 56] };

export interface AccentTokens {
  primary: string;
  primaryForeground: string;
  brand: string;
  brandHover: string;
  accent: string;
  accentForeground: string;
}
export type AccentVars = Record<Mode, AccentTokens>;

const HEX = /^#[0-9a-f]{6}$/;
export const isHexColor = (value: unknown): value is string => typeof value === "string" && HEX.test(value);
export const isThemeStyle = (value: unknown): value is ThemeStyle => THEME_STYLES.some((style) => style === value);
export const isUiMode = (value: unknown): value is UiMode => UI_MODES.some((mode) => mode === value);
export const isNavLayout = (value: unknown): value is NavLayout => NAV_LAYOUTS.some((layout) => layout === value);

/** `#RRGGBB` / `#rgb` (any case) → `#rrggbb`, or null. What `<input type="color">` and hand-typed values go through. */
export function normalizeHex(value: string): string | null {
  const v = value.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  const full = short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : v;
  return HEX.test(full) ? full : null;
}

const hex = (rgb: Rgb) => rgbToHex(rgb).toLowerCase();
const mix = (a: Rgb, b: Rgb, amountOfB: number): Rgb => [0, 1, 2].map((i) => Math.round(a[i] * (1 - amountOfB) + b[i] * amountOfB)) as unknown as Rgb;

/** Ink if it reads (≥ 4.5:1), else white, else pure black: some saturated mid-tones (pure red) need black. */
function labelFor(fill: Rgb): string {
  if (contrastRatio(fill, DARK_LABEL) >= 4.5) return "#111827";
  if (contrastRatio(fill, [255, 255, 255]) >= 4.5) return "#ffffff";
  return "#000000";
}

/**
 * The accent tokens for one mode.
 *  - `primary` is the colour itself: a fill (buttons, avatar, selected pill), always with an outline and never body text.
 *  - `primaryForeground` is whichever of ink / white reads better on it (≥ 4.5:1 for every colour).
 *  - `brand` is the same hue pushed along lightness until it is ≥ 4.5:1 on the darkest (Light) / lightest (Dark) surface any
 *    style may use and on the accent tint: links, focus ring, progress.
 *  - `accent` is a quiet tint of it for selected rows, kept ≥ 7:1 against the mode's ink.
 */
export function deriveAccentTokens(color: string, mode: Mode): AccentTokens {
  const rgb = parseHex(color);
  if (!rgb) throw new Error(`Not a #rrggbb colour: ${color}`);
  const ink = INK[mode];
  const inkRgb = parseHex(ink) as Rgb;
  const limit = SURFACE_LIMIT[mode];

  // Accent tint: as much of the colour as still leaves ink at ≥ 7:1.
  let amount = mode === "light" ? 0.22 : 0.3;
  let tint = mix(TINT_BASE[mode], rgb, amount);
  const weakest = WEAKEST_FOREGROUND[mode];
  while ((contrastRatio(inkRgb, tint) < 7 || contrastRatio(weakest, tint) < 7) && amount > 0.02) {
    amount -= 0.02;
    tint = mix(TINT_BASE[mode], rgb, amount);
  }

  // Brand: slide lightness (keeping hue and chroma) until it clears 4.5:1 on the surface limit and on the tint.
  const [l0, c, h] = rgbToOklch(rgb);
  const direction = mode === "light" ? -1 : 1;
  const at = (l: number): Rgb => oklchToRgb(Math.min(1, Math.max(0, l)), c, h).rgb;
  const passes = (candidate: Rgb) => contrastRatio(candidate, limit) >= 4.5 && contrastRatio(candidate, tint) >= 4.5;
  let l = l0;
  let brand = at(l);
  for (let i = 0; i < 120 && !passes(brand); i++) {
    l += direction * 0.01;
    brand = at(l);
  }
  const hover = at(l + direction * 0.07);

  return {
    primary: hex(rgb),
    primaryForeground: labelFor(rgb),
    brand: hex(brand),
    brandHover: hex(hover),
    accent: hex(tint),
    accentForeground: ink,
  };
}

export function deriveAccentVars(color: string): AccentVars {
  return { light: deriveAccentTokens(color, "light"), dark: deriveAccentTokens(color, "dark") };
}

const TOKEN_VARS: Record<keyof AccentTokens, string> = {
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  brand: "--brand",
  brandHover: "--brand-hover",
  accent: "--accent",
  accentForeground: "--accent-foreground",
};

/**
 * The stylesheet that applies an accent. `html[data-theme][data-mode=…]` outranks both the style palettes
 * (`[data-theme=x][data-mode=y]`) and the default accent (`html[data-mode=y]`), so it needs no `!important`, and it only
 * ever touches the accent variables, so it cannot leak into a style's shape or surfaces.
 */
export function accentCss(vars: AccentVars): string {
  return (["light", "dark"] as const)
    .map((mode) => `html[data-theme][data-mode="${mode}"]{${(Object.keys(TOKEN_VARS) as (keyof AccentTokens)[]).map((key) => `${TOKEN_VARS[key]}:${vars[mode][key]}`).join(";")}}`)
    .join("");
}

/** Parse the stored derived tokens, rejecting anything that is not a full set of `#rrggbb` values. */
export function parseAccentVars(raw: unknown): AccentVars | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Partial<AccentVars> = {};
  for (const mode of ["light", "dark"] as const) {
    const tokens = (raw as Record<string, unknown>)[mode];
    if (!tokens || typeof tokens !== "object") return null;
    const entry: Partial<AccentTokens> = {};
    for (const key of Object.keys(TOKEN_VARS) as (keyof AccentTokens)[]) {
      const value = (tokens as Record<string, unknown>)[key];
      if (!isHexColor(value)) return null;
      entry[key] = value;
    }
    out[mode] = entry as AccentTokens;
  }
  return out as AccentVars;
}

/** The luminance check the style palettes must respect for `deriveAccentTokens` to hold (used by the token test). */
export const surfaceWithinLimit = (mode: Mode, rgb: Rgb) => (mode === "light" ? relativeLuminance(rgb) >= relativeLuminance(SURFACE_LIMIT.light) : relativeLuminance(rgb) <= relativeLuminance(SURFACE_LIMIT.dark));

/**
 * Runs before first paint (inline in <head>) so a reload never flashes the wrong style, mode, layout or accent. ES5-ish on
 * purpose and self-contained; every value is validated against a fixed set or a strict colour pattern before it touches the DOM.
 */
export function bootScript(prefsKey: string): string {
  return `try{var d=document.documentElement,g=function(k){try{return localStorage.getItem(k)}catch(e){return null}};var p=JSON.parse(g(${JSON.stringify(prefsKey)})||"null");if(p){if(p.theme)d.dataset.mode=p.theme==="light"?"light":"dark";if(p.lang)d.lang=p.lang}var s=g(${JSON.stringify(APPEARANCE_KEYS.style)});if(${JSON.stringify(THEME_STYLES)}.indexOf(s)>-1)d.dataset.theme=s;var u=g(${JSON.stringify(APPEARANCE_KEYS.uiMode)});if(${JSON.stringify(UI_MODES)}.indexOf(u)>-1)d.dataset.uiMode=u;var l=g(${JSON.stringify(APPEARANCE_KEYS.layout)});if(${JSON.stringify(NAV_LAYOUTS)}.indexOf(l)>-1)d.dataset.layout=l;var a=JSON.parse(g(${JSON.stringify(APPEARANCE_KEYS.accentVars)})||"null");if(a){var K=${JSON.stringify(TOKEN_VARS)},H=/^#[0-9a-f]{6}$/,css="",ok=true;["light","dark"].forEach(function(m){var v=a[m]||{},r=[];for(var k in K){if(!H.test(v[k])){ok=false;return}r.push(K[k]+":"+v[k])}css+='html[data-theme][data-mode="'+m+'"]{'+r.join(";")+"}"});if(ok){var e=document.createElement("style");e.id="vl-accent";e.textContent=css;document.head.appendChild(e)}}}catch(e){}`;
}
