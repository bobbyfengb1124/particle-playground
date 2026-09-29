import { describe, expect, it } from "vitest";
import { EmberBehavior, ParticleKind } from "../../src/core/types";
import { Grid } from "../../src/grid/Grid";
import { Material } from "../../src/grid/materials";
import { BLUR_RADIUS, flicker, FLICKER_MAX, FLICKER_MIN, HALO_MAX_ALPHA, LightMap, shadeCell } from "../../src/lighting/LightMap";
import { ParticleSystem } from "../../src/particles/ParticleSystem";
import type { ParticleInit } from "../../src/particles/ParticleSystem";
import { Simulation } from "../../src/app/Simulation";
import { serializeGrid, serializeParticles } from "../snapshot/helpers/serialize";

const SIZE = 41;
const CENTER = 20;
const CELL = 4;
const at = (x: number, y: number): number => y * SIZE + x;

function setup(): { grid: Grid; particles: ParticleSystem; light: LightMap } {
  return { grid: new Grid(SIZE, SIZE), particles: new ParticleSystem(16), light: new LightMap(SIZE, SIZE) };
}

function spawnAtCenterCell(particles: ParticleSystem, init: Omit<ParticleInit, "x" | "y">): void {
  particles.spawn({ x: CENTER * CELL + CELL / 2, y: CENTER * CELL + CELL / 2, lifespan: 10, ...init });
}

describe("LightMap.build", () => {
  it("is all zeros with no fire and no particles", () => {
    const { grid, particles, light } = setup();
    grid.setMaterial(5, 5, Material.SAND);
    light.build(grid, particles, CELL, 0);
    expect(light.r.every((v) => v === 0)).toBe(true);
    expect(light.g.every((v) => v === 0)).toBe(true);
    expect(light.b.every((v) => v === 0)).toBe(true);
  });

  it("a single fire cell peaks on itself, falls off symmetrically, and reaches no further than 2 * BLUR_RADIUS", () => {
    const { grid, particles, light } = setup();
    grid.setMaterial(CENTER, CENTER, Material.FIRE);
    light.build(grid, particles, CELL, 0);
    const peak = light.r[at(CENTER, CENTER)];
    expect(peak).toBeGreaterThan(0);
    for (let d = 1; d <= 2 * BLUR_RADIUS; d++) {
      const right = light.r[at(CENTER + d, CENTER)];
      expect(right).toBeLessThan(light.r[at(CENTER + d - 1, CENTER)]);
      expect(right).toBeGreaterThan(0);
      expect(light.r[at(CENTER - d, CENTER)]).toBeCloseTo(right, 5);
      expect(light.r[at(CENTER, CENTER + d)]).toBeCloseTo(right, 5);
    }
    const beyond = 2 * BLUR_RADIUS + 1;
    expect(Math.abs(light.r[at(CENTER + beyond, CENTER)])).toBeLessThan(1e-3);
    expect(Math.abs(light.r[at(CENTER, CENTER - beyond)])).toBeLessThan(1e-3);
    // Warm: red dominates blue.
    expect(light.r[at(CENTER, CENTER)]).toBeGreaterThan(light.b[at(CENTER, CENTER)] * 3);
  });

  it("an ember lights in its own colour", () => {
    const blue = setup();
    spawnAtCenterCell(blue.particles, { kind: ParticleKind.EMBER, colorR: 40, colorG: 60, colorB: 255 });
    blue.light.build(blue.grid, blue.particles, CELL, 0);
    const i = at(CENTER, CENTER);
    expect(blue.light.b[i]).toBeGreaterThan(blue.light.r[i] * 3);

    const red = setup();
    spawnAtCenterCell(red.particles, { kind: ParticleKind.EMBER, colorR: 255, colorG: 50, colorB: 50 });
    red.light.build(red.grid, red.particles, CELL, 0);
    expect(red.light.r[i]).toBeGreaterThan(red.light.b[i] * 3);
  });

  it("a rocket casts light; a strobe ember in its invisible phase and a generic spark don't", () => {
    const rocket = setup();
    spawnAtCenterCell(rocket.particles, { kind: ParticleKind.ROCKET, colorR: 255, colorG: 170, colorB: 70 });
    rocket.light.build(rocket.grid, rocket.particles, CELL, 0);
    expect(rocket.light.r[at(CENTER, CENTER)]).toBeGreaterThan(0);

    const dark = setup();
    spawnAtCenterCell(dark.particles, { kind: ParticleKind.EMBER, behavior: EmberBehavior.STROBE, behaviorFlag: 0 });
    spawnAtCenterCell(dark.particles, { kind: ParticleKind.GENERIC });
    dark.light.build(dark.grid, dark.particles, CELL, 0);
    expect(dark.light.r.every((v) => v === 0)).toBe(true);
  });

  it("fades an ember's light with its age, like the renderer's alpha", () => {
    const young = setup();
    spawnAtCenterCell(young.particles, { kind: ParticleKind.EMBER });
    young.light.build(young.grid, young.particles, CELL, 0);

    const old = setup();
    old.particles.spawn({ x: CENTER * CELL + 2, y: CENTER * CELL + 2, lifespan: 10, kind: ParticleKind.EMBER })!.age = 7.5;
    old.light.build(old.grid, old.particles, CELL, 0);

    const i = at(CENTER, CENTER);
    expect(old.light.r[i]).toBeCloseTo(young.light.r[i] * 0.25, 3);
  });

  it("ignores particles outside the grid without throwing", () => {
    const { grid, particles, light } = setup();
    particles.spawn({ x: -50, y: 10, kind: ParticleKind.EMBER, lifespan: 10 });
    particles.spawn({ x: 10, y: -50, kind: ParticleKind.ROCKET, lifespan: 10 });
    particles.spawn({ x: SIZE * CELL + 5, y: 10, kind: ParticleKind.EMBER, lifespan: 10 });
    expect(() => light.build(grid, particles, CELL, 0)).not.toThrow();
    expect(light.r.every((v) => v === 0)).toBe(true);
  });
});

describe("flicker", () => {
  it("is deterministic and stays within [FLICKER_MIN, FLICKER_MAX]", () => {
    for (let idx = 0; idx < 50; idx++) {
      for (let frame = 0; frame < 200; frame += 3) {
        const f = flicker(idx, frame);
        expect(f).toBe(flicker(idx, frame));
        expect(f).toBeGreaterThanOrEqual(FLICKER_MIN);
        expect(f).toBeLessThanOrEqual(FLICKER_MAX);
      }
    }
  });

  it("varies across cells and over time", () => {
    const acrossCells = new Set(Array.from({ length: 20 }, (_, i) => flicker(i, 0)));
    const overTime = new Set(Array.from({ length: 20 }, (_, t) => flicker(7, t * 8)));
    expect(acrossCells.size).toBeGreaterThan(10);
    expect(overTime.size).toBeGreaterThan(10);
  });

  it("drifts smoothly frame to frame rather than jumping", () => {
    for (let frame = 0; frame < 100; frame++) {
      expect(Math.abs(flicker(3, frame + 1) - flicker(3, frame))).toBeLessThan(0.06);
    }
  });
});

describe("shadeCell", () => {
  it("with no light, returns the base colour (opaque) for material and fully transparent for empty", () => {
    const out = new Uint8ClampedArray(8);
    shadeCell(out, 0, [214, 178, 107], 0, 0, 0, false);
    shadeCell(out, 4, [0, 0, 0], 0, 0, 0, true);
    expect(Array.from(out)).toEqual([214, 178, 107, 255, 0, 0, 0, 0]);
  });

  it("brightens material additively and clamps at 255", () => {
    const out = new Uint8ClampedArray(4);
    shadeCell(out, 0, [214, 178, 107], 1000, 100, 0, false);
    expect(out[0]).toBe(255);
    expect(out[1]).toBeGreaterThan(178);
    expect(out[2]).toBe(107);
    expect(out[3]).toBe(255);
  });

  it("gives an empty cell the light's hue, with halo alpha capped at HALO_MAX_ALPHA", () => {
    const out = new Uint8ClampedArray(8);
    shadeCell(out, 0, [0, 0, 0], 20, 10, 5, true);
    expect(out[0]).toBe(255);
    expect(out[1]).toBeCloseTo(128, -1);
    expect(out[3]).toBeGreaterThan(0);
    expect(out[3]).toBeLessThan(HALO_MAX_ALPHA);
    shadeCell(out, 4, [0, 0, 0], 5000, 2000, 500, true);
    expect(out[7]).toBe(HALO_MAX_ALPHA);
  });
});

describe("lighting never touches the sim", () => {
  it("building a light map every tick leaves grid and particles identical to a sim that never lit", () => {
    const seed = (sim: Simulation): void => {
      sim.setSelectedMaterial(Material.WOOD);
      sim.setBrushSize(3);
      sim.paintAt(80, 150);
      sim.setSelectedMaterial(Material.FIRE);
      sim.setBrushSize(1);
      sim.paintAt(80, 130);
      sim.launchFromDrag(100, 190, 100, 150);
    };
    const lit = new Simulation({ width: 200, height: 200, seed: 7 });
    const unlit = new Simulation({ width: 200, height: 200, seed: 7 });
    seed(lit);
    seed(unlit);
    const light = new LightMap(lit.grid.width, lit.grid.height);
    for (let t = 0; t < 120; t++) {
      light.build(lit.grid, lit.particles, lit.cellSize, lit.lightTick);
      lit.tick(1 / 60);
      unlit.tick(1 / 60);
    }
    expect(serializeGrid(lit.grid)).toBe(serializeGrid(unlit.grid));
    expect(serializeParticles(lit.particles)).toEqual(serializeParticles(unlit.particles));
  });
});
