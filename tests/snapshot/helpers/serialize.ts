import type { Grid } from "../../../src/grid/Grid";
import { MATERIALS } from "../../../src/grid/materials";
import type { ParticleSystem } from "../../../src/particles/ParticleSystem";

interface SerializedParticle {
  slot: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
}

/** Plain-object particle snapshot, rounded to avoid float noise, sorted by pool slot (not iteration order). */
export function serializeParticles(system: ParticleSystem): SerializedParticle[] {
  const out: SerializedParticle[] = [];
  system.forEachActive((p) => {
    out.push({
      slot: p.poolSlot,
      x: round(p.x),
      y: round(p.y),
      vx: round(p.vx),
      vy: round(p.vy),
      age: round(p.age),
    });
  });
  return out.sort((a, b) => a.slot - b.slot);
}

function round(n: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

/** ASCII-art grid snapshot: one character per material per cell, human-diffable in review. */
export function serializeGrid(grid: Grid): string {
  const rows: string[] = [];
  for (let y = 0; y < grid.height; y++) {
    let row = "";
    for (let x = 0; x < grid.width; x++) {
      row += MATERIALS[grid.get(x, y)].symbol;
    }
    rows.push(row);
  }
  return rows.join("\n");
}
