import { describe, expect, it } from "vitest";
import { buildPrelude } from "../../src/gpu/shaders/prelude";
import { Material, MATERIALS } from "../../src/grid/materials";

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
});
