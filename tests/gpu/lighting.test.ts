import { describe, expect, it } from "vitest";
import { EmberBehavior, FireworkColor, FireworkPattern, ParticleKind } from "../../src/core/types";
import { GpuGrid } from "../../src/gpu/GpuGrid";
import { GpuLighting } from "../../src/gpu/GpuLighting";
import { GpuParticles, packFlags, type ParticleSnapshot } from "../../src/gpu/GpuParticles";
import { Grid } from "../../src/grid/Grid";
import { Material } from "../../src/grid/materials";
import { LightMap } from "../../src/lighting/LightMap";
import type { ParticleSystem } from "../../src/particles/ParticleSystem";
import { gpuChecked, testDevice } from "./helpers";

// 64×48 px canvas → a 16×12 light map, one light cell per 4 px block on every backend.
const WIDTH = 64;
const HEIGHT = 48;
const LIGHT_W = WIDTH / 4;
const LIGHT_H = HEIGHT / 4;
const FRAME = 37; // between flicker keyframes (every 8), so the smoothstep blend is exercised
// ×16 fixed-point rounding is at most 1/32 per value; the rest is last-digit float noise.
const TOLERANCE = 0.05;

/** Fully burning blocks: interior neighbours, an edge and a corner (their light partly falls off the map). */
const FIRE_BLOCKS: readonly (readonly [number, number])[] = [[5, 5], [6, 5], [0, 7], [15, 11]];

interface Rig {
  grid: GpuGrid;
  particles: GpuParticles;
  lighting: GpuLighting;
  destroy(): void;
}

async function rig(device: GPUDevice, cellSize: number): Promise<Rig> {
  const grid = await GpuGrid.create(device, WIDTH / cellSize, HEIGHT / cellSize, 1, 4 / cellSize);
  const particles = await GpuParticles.create(device, grid, { capacity: 1024, seed: 1, cellSize, width: WIDTH, height: HEIGHT, gravity: 0 });
  const lighting = await GpuLighting.create(device, grid, particles, WIDTH, HEIGHT, cellSize);
  return {
    grid,
    particles,
    lighting,
    destroy() {
      lighting.destroy();
      particles.destroy();
      grid.destroy();
    },
  };
}

/** Fine-grid materials with the given fine cells set to FIRE. */
function fineFire(cellSize: number, cells: readonly (readonly [number, number])[]): { material: Uint8Array; timer: Uint16Array } {
  const w = WIDTH / cellSize;
  const material = new Uint8Array(w * (HEIGHT / cellSize));
  for (const [x, y] of cells) material[y * w + x] = Material.FIRE;
  return { material, timer: new Uint16Array(material.length) };
}

/** Every fine cell inside the given 4 px blocks. */
function blockCells(cellSize: number, blocks: readonly (readonly [number, number])[]): [number, number][] {
  const ratio = 4 / cellSize;
  return blocks.flatMap(([bx, by]) =>
    Array.from({ length: ratio * ratio }, (_, k): [number, number] => [bx * ratio + (k % ratio), by * ratio + Math.floor(k / ratio)]),
  );
}

/** The CPU light map for FIRE at `blocks` on a 4 px grid, plus `particles`. */
function cpuLight(blocks: readonly (readonly [number, number])[], particles: readonly object[] = []): LightMap {
  const grid = new Grid(LIGHT_W, LIGHT_H);
  for (const [x, y] of blocks) grid.setMaterial(x, y, Material.FIRE);
  const standIn = { forEachActive: (cb: (p: object) => void) => particles.forEach(cb) } as unknown as ParticleSystem; // the only method build() uses
  const map = new LightMap(LIGHT_W, LIGHT_H);
  map.build(grid, standIn, 4, FRAME);
  return map;
}

/** "" if every r, g, b value is within TOLERANCE of `expected` × `factor`; otherwise the worst cell. */
function describeLightMismatch(gpu: Float32Array, expected: LightMap, factor = 1): string {
  let worst = 0;
  let at = -1;
  for (let i = 0; i < LIGHT_W * LIGHT_H; i++) {
    const want = [expected.r[i], expected.g[i], expected.b[i]];
    for (let c = 0; c < 3; c++) {
      const diff = Math.abs(gpu[i * 3 + c] - want[c] * factor);
      if (diff > worst) [worst, at] = [diff, i * 3 + c];
    }
  }
  if (worst <= TOLERANCE) return "";
  const cell = Math.floor(at / 3);
  return `off by ${worst.toFixed(3)} at light cell (${cell % LIGHT_W}, ${Math.floor(cell / LIGHT_W)}) channel ${"rgb"[at % 3]}`;
}

/** A GPU slot as the CPU Particle fields LightMap.build reads; embers × 1/sqrt(density) (Q11: rockets aren't dimmed). */
function asCpuParticle(s: ParticleSnapshot): object {
  const kind = s.flags & 0xf;
  const densityLog2 = (s.flags >> 16) & 0xf;
  const dim = kind === ParticleKind.EMBER ? 2 ** (-densityLog2 / 2) : 1;
  return {
    kind,
    behavior: (s.flags >> 4) & 0xf,
    behaviorFlag: (s.flags >> 8) & 1,
    x: s.x,
    y: s.y,
    age: s.age,
    lifespan: s.lifespan,
    colorR: (s.color & 0xff) * dim,
    colorG: ((s.color >> 8) & 0xff) * dim,
    colorB: ((s.color >> 16) & 0xff) * dim,
  };
}

describe("GpuLighting vs LightMap", () => {
  for (const cellSize of [1, 2, 4]) {
    it(`fire blocks match the CPU at ${cellSize} px cells`, async () => {
      const device = await testDevice();
      const r = await rig(device, cellSize);
      try {
        const gpu = await gpuChecked(device, async () => {
          const { material, timer } = fineFire(cellSize, blockCells(cellSize, FIRE_BLOCKS));
          r.grid.upload(material, timer);
          r.lighting.build(FRAME);
          return r.lighting.readback();
        });
        expect(describeLightMismatch(gpu, cpuLight(FIRE_BLOCKS))).toBe("");
      } finally {
        r.destroy();
      }
    });
  }

  it("a block with 5 of 16 fine cells burning gives 5/16 of a full block's light", async () => {
    const device = await testDevice();
    const r = await rig(device, 1);
    try {
      const gpu = await gpuChecked(device, async () => {
        const { material, timer } = fineFire(1, [[28, 20], [29, 20], [28, 21], [31, 21], [29, 22]]); // inside block (7, 5)
        r.grid.upload(material, timer);
        r.lighting.build(FRAME);
        return r.lighting.readback();
      });
      expect(describeLightMismatch(gpu, cpuLight([[7, 5]]), 5 / 16)).toBe("");
    } finally {
      r.destroy();
    }
  });

  it("embers and rockets match the CPU, with embers dimmed by 1/sqrt(density)", async () => {
    const device = await testDevice();
    const r = await rig(device, 1);
    try {
      const densityLog2 = 2; // 4×, so embers glow at half strength
      const { gpu, alive } = await gpuChecked(device, async () => {
        r.particles.request({ x: 20, y: 24, vx: 0, vy: 0, flags: packFlags(ParticleKind.EMBER, FireworkPattern.RING, FireworkColor.GOLD, densityLog2), count: 40 });
        r.particles.request({ x: 44, y: 24, vx: 0, vy: 0, flags: packFlags(ParticleKind.EMBER, FireworkPattern.STROBE, FireworkColor.GOLD, densityLog2), count: 40 });
        r.particles.request({ x: 32, y: 40, vx: 0, vy: -100, flags: packFlags(ParticleKind.ROCKET, FireworkPattern.RING, FireworkColor.GOLD, densityLog2), count: 1 });
        // 7 ticks: they move and age, and the strobe embers pass their first 0.09 s phase into "off".
        for (let t = 0; t < 7; t++) r.particles.tick(1 / 60, 0);
        r.lighting.build(FRAME);
        return { gpu: await r.lighting.readback(), alive: (await r.particles.readback()).alive };
      });
      const kinds = alive.map((s) => s.flags & 0xf);
      expect(kinds.filter((k) => k === ParticleKind.ROCKET)).toHaveLength(1);
      expect(kinds.filter((k) => k === ParticleKind.EMBER).length).toBeGreaterThan(0);
      const strobeOff = alive.filter((s) => ((s.flags >> 4) & 0xf) === EmberBehavior.STROBE && (s.flags & (1 << 8)) === 0);
      expect(strobeOff.length, "some strobe embers are in their off phase, so skipping them is tested").toBeGreaterThan(0);
      expect(gpu.some((v) => v > 1)).toBe(true); // the scene is actually lit, so the match isn't 0 = 0
      expect(describeLightMismatch(gpu, cpuLight([], alive.map(asCpuParticle)))).toBe("");
    } finally {
      r.destroy();
    }
  });
});
