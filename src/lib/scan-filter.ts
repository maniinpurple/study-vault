/**
 * "High-Contrast Document Scan" filter for dark / shadowed phone photos. Pure and DOM-free: it operates on RGBA
 * pixel data, so it is unit-tested in Node and used on `ImageData` in the browser.
 *
 * 1. Grayscale (Rec. 601 luma).
 * 2. Estimate the paper background per block as a high luminance percentile (text covers a minority of each block,
 *    so the percentile lands on paper) and interpolate it bilinearly → divide it out to remove shadows and gradients.
 * 3. Stretch levels (black point from the histogram) and apply a mild gamma so print turns crisp and dark.
 */

const BG_PERCENTILE = 0.9;
const MIN_BACKGROUND = 40;

export interface ScanFilterOptions {
  /** Block edge (px) for background estimation. Defaults to ~1/40 of the short edge, min 16. */
  blockSize?: number;
  /** Output luminance considered pure white (0–255). */
  whitePoint?: number;
  /** >1 darkens mid-tones (crisper text). */
  gamma?: number;
}

function percentileFromHistogram(hist: Uint32Array, total: number, fraction: number): number {
  const target = total * fraction;
  let acc = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= target) return i;
  }
  return 255;
}

export function applyDocumentScan(data: Uint8ClampedArray, width: number, height: number, options: ScanFilterOptions = {}): void {
  if (width <= 0 || height <= 0 || data.length < width * height * 4) return;
  const block = Math.max(16, options.blockSize ?? Math.round(Math.min(width, height) / 40));
  const whitePoint = options.whitePoint ?? 235;
  const gamma = options.gamma ?? 1.35;

  const lum = new Uint8Array(width * height);
  for (let i = 0, p = 0; p < lum.length; i += 4, p++) lum[p] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;

  // Background grid: one high percentile per block.
  const bx = Math.max(1, Math.ceil(width / block));
  const by = Math.max(1, Math.ceil(height / block));
  const grid = new Float32Array(bx * by);
  const hist = new Uint32Array(256);
  for (let gy = 0; gy < by; gy++) {
    for (let gx = 0; gx < bx; gx++) {
      hist.fill(0);
      const x0 = gx * block;
      const y0 = gy * block;
      const x1 = Math.min(width, x0 + block);
      const y1 = Math.min(height, y0 + block);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) hist[lum[y * width + x]]++;
      grid[gy * bx + gx] = Math.max(MIN_BACKGROUND, percentileFromHistogram(hist, (x1 - x0) * (y1 - y0), BG_PERCENTILE));
    }
  }

  // Divide out the (bilinearly interpolated) background.
  const flat = new Uint8Array(width * height);
  const levels = new Uint32Array(256);
  for (let y = 0; y < height; y++) {
    const fy = Math.min(by - 1, Math.max(0, (y + 0.5) / block - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(by - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(bx - 1, Math.max(0, (x + 0.5) / block - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(bx - 1, x0 + 1);
      const tx = fx - x0;
      const top = grid[y0 * bx + x0] * (1 - tx) + grid[y0 * bx + x1] * tx;
      const bottom = grid[y1 * bx + x0] * (1 - tx) + grid[y1 * bx + x1] * tx;
      const bg = top * (1 - ty) + bottom * ty;
      const v = Math.min(255, (lum[y * width + x] * 255) / bg);
      flat[y * width + x] = v;
      levels[Math.round(v)]++;
    }
  }

  // Levels: black point = 1st percentile (capped so faint pages are not blown out); white point fixed.
  const black = Math.min(percentileFromHistogram(levels, flat.length, 0.01), 120);
  const span = Math.max(1, whitePoint - black);
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) lut[v] = Math.round(255 * Math.pow(Math.min(1, Math.max(0, (v - black) / span)), gamma));

  for (let i = 0, p = 0; p < flat.length; i += 4, p++) {
    const out = lut[flat[p]];
    data[i] = out;
    data[i + 1] = out;
    data[i + 2] = out;
  }
}
