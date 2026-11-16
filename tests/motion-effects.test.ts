import { describe, expect, it } from "vitest";

import { centerOf, coverRadius, planWave, REVEAL, SHOCKWAVE, waveDelay } from "@/lib/motion-effects";

describe("coverRadius", () => {
  const viewport = { width: 1000, height: 600 };
  it("is the distance to the farthest corner", () => {
    expect(coverRadius({ x: 0, y: 0 }, viewport)).toBeCloseTo(Math.hypot(1000, 600));
    expect(coverRadius({ x: 1000, y: 600 }, viewport)).toBeCloseTo(Math.hypot(1000, 600));
    expect(coverRadius({ x: 900, y: 50 }, viewport)).toBeCloseTo(Math.hypot(900, 550));
  });
  it("is smallest at the center, and still covers every corner", () => {
    const center = coverRadius({ x: 500, y: 300 }, viewport);
    expect(center).toBeCloseTo(Math.hypot(500, 300));
    for (const corner of [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 0, y: 600 }, { x: 1000, y: 600 }]) {
      expect(Math.hypot(corner.x - 500, corner.y - 300)).toBeLessThanOrEqual(center + 1e-9);
    }
  });
});

describe("centerOf", () => {
  it("is the middle of a rectangle", () => {
    expect(centerOf({ left: 10, top: 20, width: 40, height: 30 })).toEqual({ x: 30, y: 35 });
  });
});

describe("waveDelay", () => {
  it("grows linearly with distance, from 0 to the full spread", () => {
    expect(waveDelay(0, 800)).toBe(0);
    expect(waveDelay(400, 800)).toBe(SHOCKWAVE.spreadMs / 2);
    expect(waveDelay(800, 800)).toBe(SHOCKWAVE.spreadMs);
  });
  it("is clamped, and safe when there is no distance to cover", () => {
    expect(waveDelay(5000, 800)).toBe(SHOCKWAVE.spreadMs);
    expect(waveDelay(-3, 800)).toBe(0);
    expect(waveDelay(10, 0)).toBe(0);
  });
});

describe("planWave", () => {
  const origin = { x: 0, y: 0 };
  const centers = [{ x: 300, y: 400, id: "far" }, { x: 3, y: 4, id: "near" }, { x: 30, y: 40, id: "mid" }];

  it("orders by distance and gives later delays to farther elements", () => {
    const plan = planWave(centers, origin, 500);
    expect(plan.map((p) => p.item.id)).toEqual(["near", "mid", "far"]);
    expect(plan.map((p) => p.delay)).toEqual([3, 32, SHOCKWAVE.spreadMs]);
  });

  it("keeps only the nearest elements beyond the limit", () => {
    expect(planWave(centers, origin, 500, 2).map((p) => p.item.id)).toEqual(["near", "mid"]);
  });
});

describe("timings", () => {
  it("match the design: a 450ms reveal and a swap while the wave is leaving the button", () => {
    expect(REVEAL.durationMs).toBe(450);
    expect(SHOCKWAVE.swapAfterMs).toBe(120);
    expect(SHOCKWAVE.hopMs).toBe(220);
    expect(SHOCKWAVE.spreadMs + SHOCKWAVE.hopMs).toBeLessThan(SHOCKWAVE.ringMs + 300);
  });
});
