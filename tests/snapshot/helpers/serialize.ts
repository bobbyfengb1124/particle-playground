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
