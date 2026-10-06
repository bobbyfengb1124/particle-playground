import { describe, expect, it } from "vitest";
import { cellRng, U32_RANGE } from "../../src/core/cellRng";

function firstDraws(seed: number, tick: number, pass: number, idx: number, n = 5): number[] {
  const rng = cellRng(seed, tick, pass, idx);
  return Array.from({ length: n }, () => rng.nextU32());
}

describe("cellRng", () => {
  it("gives the same draw sequence for the same (seed, tick, pass, idx)", () => {
    expect(firstDraws(1, 10, 3, 500)).toEqual(firstDraws(1, 10, 3, 500));
  });

  it("changes the first draw when any one input changes", () => {
    const base = firstDraws(1, 10, 3, 500, 1)[0];
    expect(firstDraws(2, 10, 3, 500, 1)[0]).not.toBe(base);
    expect(firstDraws(1, 11, 3, 500, 1)[0]).not.toBe(base);
    expect(firstDraws(1, 10, 4, 500, 1)[0]).not.toBe(base);
    expect(firstDraws(1, 10, 3, 501, 1)[0]).not.toBe(base);
  });

  it("next() is exactly nextU32() / 2^32, so multiplying a draw by U32_RANGE recovers the integer", () => {
    const a = cellRng(9, 4, 2, 77);
    const b = cellRng(9, 4, 2, 77);
    for (let i = 0; i < 100; i++) {
      const u = a.nextU32();
      const f = b.next();
      expect(f).toBe(u / U32_RANGE);
      expect(f * U32_RANGE).toBe(u);
    }
  });

  it("is roughly uniform across [0, 1)", () => {
    const buckets = new Array(10).fill(0);
    let sum = 0;
    for (let idx = 0; idx < 10000; idx++) {
      const f = cellRng(1, 0, 0, idx).next();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      sum += f;
      buckets[Math.floor(f * 10)]++;
    }
    expect(sum / 10000).toBeGreaterThan(0.48);
    expect(sum / 10000).toBeLessThan(0.52);
    for (const count of buckets) {
      expect(count).toBeGreaterThan(850);
      expect(count).toBeLessThan(1150);
    }
  });
});
