import { describe, expect, it } from "vitest";
import { createRng, deriveSeed, range } from "../../src/core/Rng";

describe("Rng", () => {
  it("is deterministic for a given seed", () => {
    const rngA = createRng(42);
    const rngB = createRng(42);
    const streamA = Array.from({ length: 5 }, () => rngA.next());
    const streamB = Array.from({ length: 5 }, () => rngB.next());
    expect(streamA).toEqual(streamB);
  });

  it("produces values in [0, 1)", () => {
    const rng = createRng(1);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("derives distinct sub-stream seeds for different stream ids", () => {
    expect(deriveSeed(1, 1)).not.toBe(deriveSeed(1, 2));
    expect(deriveSeed(1, 1)).not.toBe(deriveSeed(2, 1));
  });

  it("range() stays within [min, max)", () => {
    const rng = createRng(9);
    for (let i = 0; i < 500; i++) {
      const v = range(rng, -5, 5);
      expect(v).toBeGreaterThanOrEqual(-5);
      expect(v).toBeLessThan(5);
    }
  });
});
