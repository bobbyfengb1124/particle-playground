import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_GRAVITY } from "../../src/app/Simulation";
import { EmberBehavior, FireworkColor, FireworkPattern, type FireworkPatternValue, ParticleKind } from "../../src/core/types";
import { GpuGrid } from "../../src/gpu/GpuGrid";
import { GpuParticles, packFlags, type ParticleRequest } from "../../src/gpu/GpuParticles";
import { Material } from "../../src/grid/materials";
import { CROSSETTE_SUB_EMBER_COUNT, EMBER_COUNT } from "../../src/particles/fireworks";
import { gpuChecked, testDevice } from "./helpers";

const W = 320; // canvas px; 1 px cells, so the grid is 320×180 too
const H = 180;
const DT = 1 / 60;

let device: GPUDevice;
beforeAll(async () => {
  device = await testDevice();
});
afterAll(() => device?.destroy());

async function setup(capacity = 1024) {
  const grid = await GpuGrid.create(device, W, H, 1);
  const particles = await GpuParticles.create(device, grid, { capacity, seed: 7, cellSize: 1, width: W, height: H, gravity: DEFAULT_GRAVITY });
  return { grid, particles };
}

/** What CpuBackend.spawnParticlesAt makes: kind GENERIC (flags 0), no inherited velocity. */
const generic = (x: number, y: number, count: number): ParticleRequest => ({ x, y, vx: 0, vy: 0, flags: 0, count });

/** A GOLD rocket with vy 0: emitted on the first tick, at its apex (vy ≥ 0 after gravity) on the second. */
const rocket = (x: number, y: number, pattern: FireworkPatternValue, densityLog2: number): ParticleRequest => ({
  x,
  y,
  vx: 0,
  vy: 0,
  flags: packFlags(ParticleKind.ROCKET, pattern, FireworkColor.GOLD, densityLog2),
  count: 1,
});

/** Every slot is alive or on the free stack, exactly once: nothing lost, nothing handed out twice. */
function expectEverySlotOnce(back: Awaited<ReturnType<GpuParticles["readback"]>>, capacity: number): void {
  const slots = [...back.alive.map((p) => p.slot), ...back.free].sort((a, b) => a - b);
  expect(slots).toEqual(Array.from({ length: capacity }, (_, i) => i));
}

describe("GpuParticles", () => {
  it("spawns a generic request with CpuBackend.spawnParticlesAt's ranges", async () => {
    const { grid, particles } = await setup();
    const back = await gpuChecked(device, () => {
      particles.request(generic(160, 90, 100));
      particles.tick(DT, 0);
      return particles.readback();
    });
    expect(back.alive).toHaveLength(100);
    expect(back.freeTop).toBe(1024 - 100);
    expectEverySlotOnce(back, 1024);
    for (const p of back.alive) {
      // Emitted after this tick's update, so not moved yet.
      expect([p.x, p.y, p.age]).toEqual([160, 90, 0]);
      expect(Math.hypot(p.vx, p.vy)).toBeGreaterThanOrEqual(10 - 1e-3);
      expect(Math.hypot(p.vx, p.vy)).toBeLessThanOrEqual(60 + 1e-3);
      expect(p.radius).toBeGreaterThanOrEqual(1.5);
      expect(p.radius).toBeLessThan(3.5);
      expect(p.lifespan).toBeGreaterThanOrEqual(1);
      expect(p.lifespan).toBeLessThan(2);
      expect(p.color).toBe(0xffffff);
    }
    particles.destroy();
    grid.destroy();
  });

  it("refuses spawns past capacity without corrupting the free stack", async () => {
    const { grid, particles } = await setup(1024);
    const back = await gpuChecked(device, async () => {
      particles.request(generic(160, 90, 1000));
      particles.request(generic(160, 90, 100)); // 76 of these fit
      particles.tick(DT, 0);
      particles.request(generic(160, 90, 50)); // stack already empty
      particles.tick(DT, 0);
      return particles.readback();
    });
    expect(back.alive).toHaveLength(1024);
    expect(back.freeTop).toBe(0); // not wrapped to 4,294,967,2xx
    expectEverySlotOnce(back, 1024);
    particles.destroy();
    grid.destroy();
  });

  it("keeps particles inside the canvas", async () => {
    const { grid, particles } = await setup();
    const back = await gpuChecked(device, () => {
      particles.request(generic(2, 2, 300)); // top-left corner
      particles.request(generic(W - 2, H - 2, 300)); // bottom-right corner
      for (let t = 0; t < 50; t++) particles.tick(DT, 0);
      return particles.readback();
    });
    expect(back.alive.length).toBeGreaterThan(0); // lifespans are 1-2 s; 50 ticks is under 1 s
    for (const p of back.alive) {
      // Bounds in f32, as bounce() computes them: a particle resting on a wall sits exactly at f32(W - radius).
      expect(p.x).toBeGreaterThanOrEqual(p.radius);
      expect(p.x).toBeLessThanOrEqual(Math.fround(W - p.radius));
      expect(p.y).toBeGreaterThanOrEqual(p.radius);
      expect(p.y).toBeLessThanOrEqual(Math.fround(H - p.radius));
    }
    particles.destroy();
    grid.destroy();
  });

  it("releases every particle once its lifespan is up", async () => {
    const { grid, particles } = await setup();
    const back = await gpuChecked(device, () => {
      particles.request(generic(160, 90, 200));
      for (let t = 0; t < 130; t++) particles.tick(DT, 0); // > 2 s, the longest lifespan
      return particles.readback();
    });
    expect(back.alive).toHaveLength(0);
    expect(back.freeTop).toBe(1024);
    expectEverySlotOnce(back, 1024);
    particles.destroy();
    grid.destroy();
  });

  it("zone wind pushes particles, as applyZoneWind does", async () => {
    const meanX = async (zoneWind: number): Promise<number> => {
      const { grid, particles } = await setup();
      grid.setZoneWind(new Float32Array(W * H).fill(zoneWind));
      const back = await gpuChecked(device, () => {
        particles.request(generic(160, 90, 200));
        for (let t = 0; t < 30; t++) particles.tick(DT, 0);
        return particles.readback();
      });
      particles.destroy();
      grid.destroy();
      return back.alive.reduce((sum, p) => sum + p.x, 0) / back.alive.length;
    };
    // Same seed, so both runs spawn the same 200 velocities; +800 px/s² for 0.5 s adds roughly 80 px.
    expect(await meanX(800)).toBeGreaterThan((await meanX(0)) + 50);
  });

  it.each([0, 4])("an apex burst at density 2^%i makes EMBER_COUNT × density GOLD embers and removes the rocket", async (densityLog2) => {
    const { grid, particles } = await setup();
    const back = await gpuChecked(device, () => {
      particles.request(rocket(160, 90, FireworkPattern.RING, densityLog2));
      particles.tick(DT, 0); // emit: the rocket
      particles.tick(DT, 0); // update: apex → burst request; emit: the embers
      return particles.readback();
    });
    expect(back.alive).toHaveLength(EMBER_COUNT << densityLog2); // 24 or 384, and no rocket left
    expectEverySlotOnce(back, 1024);
    for (const p of back.alive) {
      expect(p.flags & 0xf).toBe(ParticleKind.EMBER);
      // GOLD's bands: R 255, G 140–200, B 40–100. Also checks the R | G<<8 | B<<16 packing order.
      expect(p.color & 0xff).toBe(255);
      expect((p.color >> 8) & 0xff).toBeGreaterThanOrEqual(140);
      expect((p.color >> 8) & 0xff).toBeLessThanOrEqual(200);
      expect((p.color >> 16) & 0xff).toBeGreaterThanOrEqual(40);
      expect((p.color >> 16) & 0xff).toBeLessThanOrEqual(100);
    }
    particles.destroy();
    grid.destroy();
  });

  it("each crossette ember splits exactly once into CROSSETTE_SUB_EMBER_COUNT plain embers", async () => {
    const { grid, particles } = await setup();
    const back = await gpuChecked(device, () => {
      particles.request(rocket(160, 90, FireworkPattern.CROSSETTE, 0));
      particles.tick(DT, 0);
      particles.tick(DT, 0); // the 24 crossette embers are born
      // 0.8 s more: past every split (lifespan ≤ 1.68 s × 0.45 = 0.756 s), before any parent dies (lifespan ≥ 1.12 s).
      for (let t = 0; t < 48; t++) particles.tick(DT, 0);
      return particles.readback();
    });
    const behaviorOf = (p: { flags: number }) => (p.flags >> 4) & 0xf;
    const parents = back.alive.filter((p) => behaviorOf(p) === EmberBehavior.CROSSETTE);
    const children = back.alive.filter((p) => behaviorOf(p) === EmberBehavior.NONE);
    expect(parents).toHaveLength(EMBER_COUNT);
    expect(children).toHaveLength(EMBER_COUNT * CROSSETTE_SUB_EMBER_COUNT); // 168: one split each, not one per tick
    for (const p of parents) expect(p.flags & 0x100).not.toBe(0); // FLAG_BEHAVIOR_FLAG: the "already split" guard
    expectEverySlotOnce(back, 1024);
    particles.destroy();
    grid.destroy();
  });

  it("a low burst over wood sets whole 4×4 px blocks on fire, and embers that land are used up", async () => {
    const { grid, particles } = await setup();
    // Wood in the bottom 32 rows (y 148–179). 148 and W = 320 are multiples of 4, so every 4×4 block there is all wood.
    const material = new Uint8Array(W * H);
    material.fill(Material.WOOD, 148 * W);
    grid.upload(material, new Uint16Array(W * H));

    const { cells, back } = await gpuChecked(device, async () => {
      particles.request(rocket(160, 130, FireworkPattern.RING, 0)); // bursts 18 px above the wood
      for (let t = 0; t < 30; t++) particles.tick(DT, 0); // 0.5 s. The grid is never stepped, so fire stays FIRE.
      return { cells: await grid.readback(), back: await particles.readback() };
    });

    const burning = [...cells.material.keys()].filter((i) => cells.material[i] === Material.FIRE);
    expect(burning.length).toBeGreaterThan(0);
    for (const i of burning) {
      const x = i % W;
      const y = Math.floor(i / W);
      expect(y).toBeGreaterThanOrEqual(148); // only wood burned
      // ...and the whole 4×4 block on the 4 px lattice around it burned with it.
      const blockX = x - (x % 4);
      const blockY = y - (y % 4);
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 4; dx++) expect(cells.material[(blockY + dy) * W + blockX + dx]).toBe(Material.FIRE);
      }
    }
    for (const p of back.alive) expect(p.y).toBeLessThan(148); // no ember left sitting inside wood or fire
    expectEverySlotOnce(back, 1024);
    particles.destroy();
    grid.destroy();
  });

  it("a burst bigger than the free slots fills every slot and refuses the rest cleanly", async () => {
    const { grid, particles } = await setup(1024);
    const back = await gpuChecked(device, () => {
      particles.request(rocket(160, 90, FireworkPattern.RING, 6)); // 24 × 64 = 1,536 embers into 1,024 slots
      particles.tick(DT, 0);
      particles.tick(DT, 0); // update frees the rocket's slot before emit pops, so all 1,024 are available
      return particles.readback();
    });
    expect(back.alive).toHaveLength(1024);
    expect(back.freeTop).toBe(0); // not wrapped to 4,294,967,2xx
    for (const p of back.alive) expect(p.flags & 0xf).toBe(ParticleKind.EMBER); // the rocket is gone; only embers
    expectEverySlotOnce(back, 1024);
    particles.destroy();
    grid.destroy();
  });
});
