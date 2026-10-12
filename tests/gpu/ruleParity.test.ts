import { afterAll, beforeAll, describe, it } from "vitest";
import type { Grid } from "../../src/grid/Grid";
import { Material } from "../../src/grid/materials";
import { FIRE_LIFETIME_TICKS } from "../../src/grid/rules/fire";
import { MAX_STAGE, WATERED_TICKS_PER_STAGE } from "../../src/grid/rules/plant";
import { SMOKE_LIFETIME_TICKS } from "../../src/grid/rules/smoke";
import { STEAM_REVERT_TICKS } from "../../src/grid/rules/steam";
import { WindField, type WindZone } from "../../src/wind/WindField";
import { runParity, scatterScene, testDevice } from "./helpers";

let device: GPUDevice;
beforeAll(async () => {
  device = await testDevice();
});
afterAll(() => device?.destroy());

const SIZES = [[96, 64], [97, 65]] as const;
const SEEDS = [0xc0ffee, 7];
const SCALES = [1, 4];

describe.each(SIZES)("acid matches PhasedStepper at %i×%i", (width, height) => {
  it.each(SEEDS)("seed %i", async (seed) => {
    const scene = scatterScene(width, height, seed, [
      { material: Material.ACID, share: 0.12 },
      { material: Material.SAND, share: 0.1 },
      { material: Material.WATER, share: 0.1 },
      { material: Material.OIL, share: 0.08 },
      { material: Material.STONE, share: 0.05 },
      { material: Material.WOOD, share: 0.05 },
    ]);
    await runParity(device, scene, { seed });
  });
});

describe.each(SIZES)("smoke and steam match PhasedStepper at %i×%i", (width, height) => {
  it.each(SCALES.flatMap((scale) => SEEDS.map((seed) => [scale, seed])))("scale %i, seed %i", async (scale, seed) => {
    const scene = scatterScene(width, height, seed, [
      { material: Material.SMOKE, share: 0.12, maxTimer: SMOKE_LIFETIME_TICKS * scale },
      { material: Material.STEAM, share: 0.12, maxTimer: STEAM_REVERT_TICKS * scale },
      { material: Material.WATER, share: 0.1 },
      { material: Material.STONE, share: 0.06 },
    ]);
    await runParity(device, scene, { seed, scale });
  });
});

describe.each(SIZES)("seed matches PhasedStepper at %i×%i", (width, height) => {
  it.each(SCALES.flatMap((scale) => SEEDS.map((seed) => [scale, seed])))("scale %i, seed %i", async (scale, seed) => {
    const scene = scatterScene(width, height, seed, [
      { material: Material.SEED, share: 0.12, maxTimer: ((MAX_STAGE * scale - 1) << 8) | WATERED_TICKS_PER_STAGE },
      { material: Material.WATER, share: 0.15 },
      { material: Material.OIL, share: 0.06 },
      { material: Material.SAND, share: 0.06 },
      { material: Material.STONE, share: 0.08 },
      { material: Material.PLANT, share: 0.04 },
    ]);
    await runParity(device, scene, { seed, scale });
  });
});

describe.each(SIZES)("fire matches PhasedStepper at %i×%i", (width, height) => {
  it.each(SCALES.flatMap((scale) => SEEDS.map((seed) => [scale, seed])))("scale %i, seed %i", async (scale, seed) => {
    const scene = scatterScene(width, height, seed, [
      { material: Material.FIRE, share: 0.06, maxTimer: FIRE_LIFETIME_TICKS * scale },
      { material: Material.WOOD, share: 0.14 },
      { material: Material.OIL, share: 0.06 },
      { material: Material.PLANT, share: 0.05 },
      { material: Material.WATER, share: 0.08 },
      { material: Material.STEAM, share: 0.05, maxTimer: STEAM_REVERT_TICKS * scale },
      { material: Material.STONE, share: 0.04 },
    ]);
    await runParity(device, scene, { seed, scale });
  });
});

describe.each(SIZES)("ice matches PhasedStepper at %i×%i", (width, height) => {
  it.each(SEEDS)("seed %i", async (seed) => {
    const scene = scatterScene(width, height, seed, [
      { material: Material.ICE, share: 0.12 },
      { material: Material.WATER, share: 0.18 },
      { material: Material.FIRE, share: 0.03, maxTimer: FIRE_LIFETIME_TICKS },
      { material: Material.OIL, share: 0.06 },
      { material: Material.SAND, share: 0.05 },
      { material: Material.STONE, share: 0.06 },
    ]);
    await runParity(device, scene, { seed });
  });
});

// Overlapping zones (300 + 600 clamps to 800) and a -250 zone; the global winds below make some
// cells sum to exactly 0 (+250 over the -250 zone, -800 over the clamped 800), which must not draw.
const WIND_ZONES: WindZone[] = [
  { gx: 0, gy: 0, gw: 40, gh: 64, strength: 300 },
  { gx: 30, gy: 10, gw: 30, gh: 30, strength: 600 },
  { gx: 60, gy: 0, gw: 36, gh: 64, strength: -250 },
];
const GLOBAL_WINDS = [0, 250, -800];

describe.each(SIZES)("wind pushes smoke and steam as PhasedStepper at %i×%i", (width, height) => {
  it.each(GLOBAL_WINDS.flatMap((globalWind) => SEEDS.map((seed) => [globalWind, seed])))("global wind %i, seed %i", async (globalWind, seed) => {
    const field = new WindField(width, height, 1);
    field.rebuild(WIND_ZONES);
    const scene = scatterScene(width, height, seed, [
      { material: Material.SMOKE, share: 0.12, maxTimer: SMOKE_LIFETIME_TICKS },
      { material: Material.STEAM, share: 0.12, maxTimer: STEAM_REVERT_TICKS },
      { material: Material.WATER, share: 0.06 },
      { material: Material.STONE, share: 0.06 },
    ]);
    await runParity(device, scene, { seed, zoneWind: field.values, globalWind });
  });
});

/** Every material at once, with zones and the slider: each rule beside every other rule. */
function everythingScene(width: number, height: number, seed: number, scale: number): Grid {
  return scatterScene(width, height, seed, [
    { material: Material.SAND, share: 0.06 },
    { material: Material.STONE, share: 0.04 },
    { material: Material.WATER, share: 0.1 },
    { material: Material.OIL, share: 0.05 },
    { material: Material.WOOD, share: 0.06 },
    { material: Material.FIRE, share: 0.04, maxTimer: FIRE_LIFETIME_TICKS * scale },
    { material: Material.SMOKE, share: 0.04, maxTimer: SMOKE_LIFETIME_TICKS * scale },
    { material: Material.STEAM, share: 0.04, maxTimer: STEAM_REVERT_TICKS * scale },
    { material: Material.ACID, share: 0.03 },
    { material: Material.SEED, share: 0.04, maxTimer: ((MAX_STAGE * scale - 1) << 8) | WATERED_TICKS_PER_STAGE },
    { material: Material.PLANT, share: 0.03 },
    { material: Material.ICE, share: 0.05 },
  ]);
}

describe.each(SIZES)("every material, zones and slider match PhasedStepper at %i×%i", (width, height) => {
  it.each(SCALES.flatMap((scale) => SEEDS.map((seed) => [scale, seed])))("scale %i, seed %i", async (scale, seed) => {
    const field = new WindField(width, height, 1);
    field.rebuild(WIND_ZONES);
    await runParity(device, everythingScene(width, height, seed, scale), { seed, scale, zoneWind: field.values, globalWind: 250 });
  });

  it("four steps per submit at scale 4 (the 1 px app path)", async () => {
    const field = new WindField(width, height, 1);
    field.rebuild(WIND_ZONES);
    await runParity(device, everythingScene(width, height, SEEDS[0], 4), {
      seed: SEEDS[0], scale: 4, zoneWind: field.values, globalWind: 250, stepsPerSubmit: 4, checkpoints: [4, 52, 200],
    });
  });
});
