export interface Rng {
  /** Returns a float in [0, 1). */
  next(): number;
}

/** Seedable PRNG (mulberry32) — deterministic for a given seed, no dependency on Math.random(). */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  return {
    next(): number {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

/** Derives an independent sub-stream seed from a base seed, so unrelated systems don't perturb each other's snapshots. */
export function deriveSeed(baseSeed: number, streamId: number): number {
  let h = (baseSeed ^ Math.imul(streamId, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

export function range(rng: Rng, min: number, max: number): number {
  return min + rng.next() * (max - min);
}
