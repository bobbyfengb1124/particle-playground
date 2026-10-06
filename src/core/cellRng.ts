import type { Rng } from "./Rng";

/** lowbias32 integer finalizer — every step is a u32 op, so WGSL reproduces it bit for bit. */
export function hash32(x: number): number {
  x = (x ^ (x >>> 16)) >>> 0;
  x = Math.imul(x, 0x7feb352d) >>> 0;
  x = (x ^ (x >>> 15)) >>> 0;
  x = Math.imul(x, 0x846ca68b) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/** An Rng that also exposes its raw u32 draws; `next()` is always exactly `nextU32() / 2^32`. */
export interface CellRng extends Rng {
  nextU32(): number;
}

/** 2^32 — how many values a u32 holds. Every Rng here returns u32 / U32_RANGE, so multiplying a draw by it recovers the exact integer. */
export const U32_RANGE = 2 ** 32;

const GOLDEN = 0x9e3779b9;

/**
 * Stateless RNG for one cell visit in a phased tick — a sibling of
 * createRng (Rng.ts), not a replacement: the CPU GridStepper and particles
 * keep their shared streams. The same (seed, tick, pass, idx) always yields
 * the same draw sequence with no shared stream position, which is what lets
 * parallel GPU threads reproduce it exactly. Draw n is hash32(base + n *
 * GOLDEN), so a cell's draws never depend on how many other cells drew.
 */
export function cellRng(seed: number, tick: number, pass: number, idx: number): CellRng {
  const base = hash32((seed ^ hash32((tick ^ hash32((Math.imul(idx, 9) + pass) >>> 0)) >>> 0)) >>> 0);
  let counter = 0;
  const nextU32 = (): number => hash32((base + Math.imul(counter++, GOLDEN)) >>> 0);
  return {
    nextU32,
    next: () => nextU32() / U32_RANGE,
  };
}

/** Pass index reserved for per-tick draws that aren't tied to a cell visit (e.g. the pass-order shuffle). */
export const TICK_STREAM_PASS = 9;
