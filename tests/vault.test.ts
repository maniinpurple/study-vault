import { describe, expect, it } from "vitest";

import { takeSections, type ProblemGroup } from "@/lib/vault";

import { card } from "./helpers/fixtures";

const group = (key: string | null, n: number): ProblemGroup => ({ key, cards: Array.from({ length: n }, (_, i) => card(`${key ?? "none"}-${i}`)) });

describe("takeSections", () => {
  const sections = [group("a", 3), group("b", 4), group(null, 2)];

  it("keeps the first N cards across sections, in order, and reports what was cut", () => {
    const { sections: out, remaining } = takeSections(sections, 5);
    expect(out.map((s) => [s.key, s.cards.length])).toEqual([["a", 3], ["b", 2]]);
    expect(remaining).toBe(4);
  });
  it("shows everything when the limit is large enough, and nothing for a zero limit", () => {
    expect(takeSections(sections, 100)).toMatchObject({ remaining: 0 });
    expect(takeSections(sections, 100).sections).toHaveLength(3);
    expect(takeSections(sections, 0)).toEqual({ sections: [], remaining: 9 });
  });
  it("drops no cards when growing the limit step by step", () => {
    let seen = 0;
    for (let limit = 4; ; limit += 4) {
      const { sections: out, remaining } = takeSections(sections, limit);
      seen = out.reduce((n, s) => n + s.cards.length, 0);
      if (remaining === 0) break;
    }
    expect(seen).toBe(9);
  });
});
