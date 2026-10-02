import { EmberBehavior, ParticleKind } from "../core/types";
import type { Grid } from "../grid/Grid";
import { Material } from "../grid/materials";
import type { ParticleSystem } from "../particles/ParticleSystem";

const FIRE_LIGHT: readonly [number, number, number] = [255, 140, 50]; // warm orange, per fire cell before blurring
const FIRE_INTENSITY = 1;
// Embers/rockets are single-cell sources, so they need a much bigger splat
// than fire (which usually comes in blocks) to show after the blur spreads
// them over ~13x13 cells.
const PARTICLE_INTENSITY = 12;

/** Box-blur radius in cells; two passes make a triangle falloff reaching 2 * BLUR_RADIUS cells (~24px at 4px cells). */
export const BLUR_RADIUS = 3;
const BLUR_PASSES = 2;

const FLICKER_PERIOD_FRAMES = 8; // ticks between flicker noise keyframes (~0.13s at 60Hz)
export const FLICKER_MIN = 0.85;
export const FLICKER_MAX = 1.15;

/** How strongly light brightens a non-empty cell's own colour (additive, then clamped). */
const LIT_GAIN = 0.6;
/** Empty-cell halo alpha per unit of the light's brightest channel, and its cap (0-255). */
const HALO_GAIN = 0.8;
export const HALO_MAX_ALPHA = 140;

/** Same (a, b) always gives the same random-looking float in [0, 1) — a stateless lookup, unlike Rng's stream. */
function hashToUnit(a: number, b: number): number {
  let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Per-cell light multiplier in [FLICKER_MIN, FLICKER_MAX]: value noise over
 * `frame`, smoothly interpolated between hashed keyframes so it drifts rather
 * than strobes. A pure hash, never the sim RNG, so it can't perturb snapshots.
 */
export function flicker(idx: number, frame: number): number {
  const keyframe = Math.floor(frame / FLICKER_PERIOD_FRAMES);
  const progress = (frame - keyframe * FLICKER_PERIOD_FRAMES) / FLICKER_PERIOD_FRAMES;
  const eased = progress * progress * (3 - 2 * progress); // smoothstep: flat at both ends, so no kink at keyframes
  const noise = hashToUnit(idx, keyframe) * (1 - eased) + hashToUnit(idx, keyframe + 1) * eased;
  return FLICKER_MIN + noise * (FLICKER_MAX - FLICKER_MIN);
}

/**
 * Writes one lit RGBA pixel into `out` at offset `o`. A non-empty cell keeps
 * its own colour plus an additive tint; an empty cell shows the light's hue
 * as a translucent halo. Writes into a buffer rather than returning a tuple
 * so the per-cell render loop allocates nothing.
 */
export function shadeCell(
  out: Uint8ClampedArray,
  o: number,
  base: readonly [number, number, number],
  lr: number,
  lg: number,
  lb: number,
  isEmpty: boolean,
): void {
  if (!isEmpty) {
    out[o] = Math.min(255, base[0] + lr * LIT_GAIN);
    out[o + 1] = Math.min(255, base[1] + lg * LIT_GAIN);
    out[o + 2] = Math.min(255, base[2] + lb * LIT_GAIN);
    out[o + 3] = 255;
    return;
  }
  const peak = Math.max(lr, lg, lb);
  if (peak <= 0) {
    out[o] = 0;
    out[o + 1] = 0;
    out[o + 2] = 0;
    out[o + 3] = 0;
    return;
  }
  const scale = 255 / peak;
  out[o] = lr * scale;
  out[o + 1] = lg * scale;
  out[o + 2] = lb * scale;
  out[o + 3] = Math.min(HALO_MAX_ALPHA, peak * HALO_GAIN);
}

/** Grid-resolution RGB light buffer, rebuilt from scratch each rendered frame. Render-only — nothing in tick() reads it. */
export class LightMap {
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
  private readonly scratch: Float32Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    const n = width * height;
    this.r = new Float32Array(n);
    this.g = new Float32Array(n);
    this.b = new Float32Array(n);
    this.scratch = new Float32Array(n);
  }

  build(grid: Grid, particles: ParticleSystem, cellSize: number, frame: number): void {
    this.r.fill(0);
    this.g.fill(0);
    this.b.fill(0);

    const { material } = grid;
    for (let i = 0; i < material.length; i++) {
      if (material[i] !== Material.FIRE) continue;
      const intensity = FIRE_INTENSITY * flicker(i, frame);
      this.r[i] += FIRE_LIGHT[0] * intensity;
      this.g[i] += FIRE_LIGHT[1] * intensity;
      this.b[i] += FIRE_LIGHT[2] * intensity;
    }

    particles.forEachActive((p) => {
      if (p.kind !== ParticleKind.EMBER && p.kind !== ParticleKind.ROCKET) return;
      // Same visibility and fade as ParticleRenderer, so light matches what's drawn.
      if (p.kind === ParticleKind.EMBER && p.behavior === EmberBehavior.STROBE && p.behaviorFlag === 0) return;
      const gx = Math.floor(p.x / cellSize);
      const gy = Math.floor(p.y / cellSize);
      if (gx < 0 || gy < 0 || gx >= this.width || gy >= this.height) return;
      const lifeRatio = p.lifespan > 0 ? p.age / p.lifespan : 1;
      const intensity = PARTICLE_INTENSITY * Math.max(0, 1 - lifeRatio);
      const i = gy * this.width + gx;
      this.r[i] += p.colorR * intensity;
      this.g[i] += p.colorG * intensity;
      this.b[i] += p.colorB * intensity;
    });

    for (let pass = 0; pass < BLUR_PASSES; pass++) {
      this.blur(this.r);
      this.blur(this.g);
      this.blur(this.b);
    }
  }

  /** One separable box-blur pass (horizontal into scratch, vertical back), via running sums so it's O(cells) at any radius. Light past the grid edge is simply lost. */
  private blur(channel: Float32Array): void {
    const { width: w, height: h, scratch } = this;
    const r = BLUR_RADIUS;
    const inv = 1 / (2 * r + 1);

    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let x = 0; x < Math.min(r, w); x++) sum += channel[row + x];
      for (let x = 0; x < w; x++) {
        const add = x + r;
        const drop = x - r - 1;
        if (add < w) sum += channel[row + add];
        if (drop >= 0) sum -= channel[row + drop];
        scratch[row + x] = sum * inv;
      }
    }

    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = 0; y < Math.min(r, h); y++) sum += scratch[y * w + x];
      for (let y = 0; y < h; y++) {
        const add = y + r;
        const drop = y - r - 1;
        if (add < h) sum += scratch[add * w + x];
        if (drop >= 0) sum -= scratch[drop * w + x];
        channel[y * w + x] = sum * inv;
      }
    }
  }
}
