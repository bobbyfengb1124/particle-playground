import { describe, expect, it } from "vitest";
import { buildPrelude } from "../../src/gpu/shaders/prelude";
import { Material, MATERIALS } from "../../src/grid/materials";
import { FIRE_LIFETIME_TICKS } from "../../src/grid/rules/fire";
import { MAX_STAGE, WATERED_TICKS_PER_STAGE } from "../../src/grid/rules/plant";
import { SMOKE_LIFETIME_TICKS } from "../../src/grid/rules/smoke";
import { STEAM_REVERT_TICKS } from "../../src/grid/rules/steam";
import { ZONE_WIND_MAX } from "../../src/wind/WindField";

describe("buildPrelude", () => {
  const wgsl = buildPrelude();

  it("declares every Material id as a WGSL u32 const", () => {
    for (const [name, id] of Object.entries(Material)) {
      expect(wgsl).toContain(`const MAT_${name}: u32 = ${id}u;`);
    }
  });

  it("gives density() a case for exactly the liquids, with their densities", () => {
    const cases = [...wgsl.matchAll(/case (\d+)u: \{ return (\d+)u; \}/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const liquids = MATERIALS.flatMap((info, id) => (info.density === undefined ? [] : [[id, info.density]]));
    expect(cases).toEqual(liquids);
  });

  it("gives isFlammable() exactly the flammable materials", () => {
    const line = wgsl.match(/case ([\du, ]+): \{ return true; \}/);
    const ids = line![1].split(", ").map((s) => Number(s.replace("u", "")));
    const flammable = MATERIALS.flatMap((info, id) => (info.flammable ? [id] : []));
    expect(ids).toEqual(flammable);
  });

  it("declares the rule constants with their TS values", () => {
    expect(wgsl).toContain(`const FIRE_LIFETIME_TICKS: u32 = ${FIRE_LIFETIME_TICKS}u;`);
    expect(wgsl).toContain(`const SMOKE_LIFETIME_TICKS: u32 = ${SMOKE_LIFETIME_TICKS}u;`);
    expect(wgsl).toContain(`const STEAM_REVERT_TICKS: u32 = ${STEAM_REVERT_TICKS}u;`);
    expect(wgsl).toContain(`const WATERED_TICKS_PER_STAGE: u32 = ${WATERED_TICKS_PER_STAGE}u;`);
    expect(wgsl).toContain(`const MAX_STAGE: u32 = ${MAX_STAGE}u;`);
    expect(wgsl).toContain(`const ZONE_WIND_MAX: i32 = ${ZONE_WIND_MAX};`);
  });
});
