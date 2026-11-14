/**
 * Color math behind the design tokens (DESIGN_SYSTEM.md §2): OKLCH → sRGB and WCAG 2.x contrast.
 * Pure, so the token contrast table can be verified in unit tests.
 */

export type Rgb = readonly [number, number, number];

const toLinear = (channel: number) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
const fromLinear = (channel: number) => (channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055);
const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** OKLCH (L 0–1, C, H in degrees) → 8-bit sRGB. `inGamut` is false when the color had to be clipped. */
export function oklchToRgb(l: number, c: number, h: number): { rgb: Rgb; inGamut: boolean } {
  const hue = (h * Math.PI) / 180;
  const a = c * Math.cos(hue);
  const b = c * Math.sin(hue);
  const l3 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m3 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s3 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  ];
  const rgb = linear.map((v) => Math.round(clamp01(fromLinear(clamp01(v))) * 255)) as unknown as Rgb;
  return { rgb, inGamut: linear.every((v) => v >= -0.0005 && v <= 1.0005) };
}

export function rgbToHex(rgb: Rgb): string {
  return `#${rgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** WCAG relative luminance of an sRGB color. */
export function relativeLuminance([r, g, b]: Rgb): number {
  return 0.2126 * toLinear(r / 255) + 0.7152 * toLinear(g / 255) + 0.0722 * toLinear(b / 255);
}

/** WCAG 2.x contrast ratio (1–21), symmetric in its arguments. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Parse `oklch(L C H)` (the only form the token file uses). Null for anything else. */
export function parseOklch(value: string): [number, number, number] | null {
  const match = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}
