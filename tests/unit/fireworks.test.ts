import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/app/Simulation";
import { EmberBehavior, FireworkColor, FireworkPattern, ParticleKind, type FireworkColorValue } from "../../src/core/types";
import { Material } from "../../src/grid/materials";
import { FIREWORK_COLOR_PRESETS } from "../../src/particles/fireworks";
import type { Particle } from "../../src/particles/Particle";

/** Ticks `sim` until at least one ember exists (i.e. some rocket has burst), or throws if it never does. */
function tickUntilEmbersAppear(sim: Simulation, maxTicks = 600): void {
  for (let i = 0; i < maxTicks; i++) {
    let found = false;
    sim.particles.forEachActive((p) => {
      if (p.kind === ParticleKind.EMBER) found = true;
    });
    if (found) return;
    sim.tick(1 / 60);
  }
  throw new Error("burst did not occur within maxTicks");
}

function embers(sim: Simulation): Particle[] {
  const out: Particle[] = [];
  sim.particles.forEachActive((p) => {
    if (p.kind === ParticleKind.EMBER) out.push(p);
  });
  return out;
}

describe("Fireworks: launch", () => {
  it("a larger drag distance launches the rocket higher before it bursts", () => {
    const low = new Simulation({ width: 200, height: 800, cellSize: 4, seed: 1 });
    low.setMode("launch");
    low.launchFromDrag(100, 780, 100, 780); // no drag -> minimum power
    tickUntilEmbersAppear(low);
    const lowBurstY = Math.max(...embers(low).map((p) => p.y));

    const high = new Simulation({ width: 200, height: 800, cellSize: 4, seed: 1 });
    high.setMode("launch");
    high.launchFromDrag(100, 780, 100, 380); // half-canvas-height drag -> maximum power
    tickUntilEmbersAppear(high);
    const highBurstY = Math.min(...embers(high).map((p) => p.y));

    expect(highBurstY).toBeLessThan(lowBurstY);
  });

  it("the rocket itself is consumed by its own burst", () => {
    const sim = new Simulation({ width: 200, height: 800, cellSize: 4, seed: 2 });
    sim.setMode("launch");
    sim.launchFromDrag(100, 780, 100, 780);
    tickUntilEmbersAppear(sim);

    let rocketStillPresent = false;
    sim.particles.forEachActive((p) => {
      if (p.kind === ParticleKind.ROCKET) rocketStillPresent = true;
    });
    expect(rocketStillPresent).toBe(false);
  });
});

describe("Fireworks: burst patterns", () => {
  it("ring embers spread out evenly in all directions", () => {
    const sim = new Simulation({ width: 400, height: 400, cellSize: 4, seed: 3 });
    sim.setFireworkPattern(FireworkPattern.RING);
    sim.setMode("launch");
    sim.launchFromDrag(200, 380, 200, 280);
    tickUntilEmbersAppear(sim);

    const burst = embers(sim);
    expect(burst.length).toBeGreaterThan(10);
    let sumVx = 0;
    let sumVy = 0;
    for (const p of burst) {
      const speed = Math.hypot(p.vx, p.vy) || 1;
      sumVx += p.vx / speed;
      sumVy += p.vy / speed;
    }
    // Evenly spaced directions cancel out; a lopsided/one-sided spread would not.
    expect(Math.abs(sumVx) / burst.length).toBeLessThan(0.05);
    expect(Math.abs(sumVy) / burst.length).toBeLessThan(0.05);
  });

  it("willow embers get extra drag and extra gravity compared to ring embers", () => {
    const ring = new Simulation({ width: 400, height: 400, cellSize: 4, seed: 4 });
    ring.setFireworkPattern(FireworkPattern.RING);
    ring.setMode("launch");
    ring.launchFromDrag(200, 380, 200, 280);
    tickUntilEmbersAppear(ring);
    const ringEmber = embers(ring)[0];

    const willow = new Simulation({ width: 400, height: 400, cellSize: 4, seed: 4 });
    willow.setFireworkPattern(FireworkPattern.WILLOW);
    willow.setMode("launch");
    willow.launchFromDrag(200, 380, 200, 280);
    tickUntilEmbersAppear(willow);
    const willowEmber = embers(willow)[0];

    expect(willowEmber.dragCoef).toBeGreaterThan(ringEmber.dragCoef);
    expect(willowEmber.gravityScale).toBeGreaterThan(ringEmber.gravityScale);
  });

  it("crossette embers each spawn a smaller secondary burst partway through their life", () => {
    const sim = new Simulation({ width: 400, height: 400, cellSize: 4, seed: 5 });
    sim.setFireworkPattern(FireworkPattern.CROSSETTE);
    sim.setMode("launch");
    sim.launchFromDrag(200, 380, 200, 280);
    tickUntilEmbersAppear(sim);
    const countAtBurst = sim.particles.activeCount;

    // Comfortably past the split threshold but short of the shortest possible ember lifespan.
    for (let i = 0; i < 50; i++) sim.tick(1 / 60);

    expect(sim.particles.activeCount).toBeGreaterThan(countAtBurst);
    const stillCrossette = embers(sim).filter((p) => p.behavior === EmberBehavior.CROSSETTE);
    for (const p of stillCrossette) expect(p.behaviorFlag).toBe(1); // one-shot split guard tripped
  });

  it("strobe embers flicker between visible and invisible as they age", () => {
    const sim = new Simulation({ width: 400, height: 400, cellSize: 4, seed: 6 });
    sim.setFireworkPattern(FireworkPattern.STROBE);
    sim.setMode("launch");
    sim.launchFromDrag(200, 380, 200, 280);
    tickUntilEmbersAppear(sim);

    const sample = embers(sim)[0];
    const flags = new Set<number>([sample.behaviorFlag]);
    for (let i = 0; i < 30; i++) {
      sim.tick(1 / 60);
      flags.add(sample.behaviorFlag);
    }
    expect(flags).toEqual(new Set([0, 1]));
  });
});

/** True if `p`'s RGB falls inside the given preset's channel bands. */
function inPreset(p: Particle, color: FireworkColorValue): boolean {
  const { r, g, b } = FIREWORK_COLOR_PRESETS[color];
  const within = (v: number, [lo, hi]: readonly [number, number]): boolean => v >= lo && v <= hi;
  return within(p.colorR, r) && within(p.colorG, g) && within(p.colorB, b);
}

function rockets(sim: Simulation): Particle[] {
  const out: Particle[] = [];
  sim.particles.forEachActive((p) => {
    if (p.kind === ParticleKind.ROCKET) out.push(p);
  });
  return out;
}

describe("Fireworks: colours", () => {
  it("defaults to the original gold embers", () => {
    const sim = new Simulation({ width: 400, height: 400, cellSize: 4, seed: 9 });
    expect(sim.fireworkColor).toBe(FireworkColor.GOLD);
    sim.launchFromDrag(200, 380, 200, 280);
    tickUntilEmbersAppear(sim);

    for (const p of embers(sim)) {
      expect(p.colorR).toBe(255);
      expect(p.colorG).toBeGreaterThanOrEqual(140);
      expect(p.colorG).toBeLessThanOrEqual(200);
      expect(p.colorB).toBeGreaterThanOrEqual(40);
      expect(p.colorB).toBeLessThanOrEqual(100);
    }
  });

  it("the rising rocket is tinted with its launch colour", () => {
    const sim = new Simulation({ width: 400, height: 400, cellSize: 4, seed: 9 });
    sim.setFireworkColor(FireworkColor.RED);
    sim.launchFromDrag(200, 380, 200, 280);

    const [rocket] = rockets(sim);
    expect([rocket.colorR, rocket.colorG, rocket.colorB]).toEqual([...FIREWORK_COLOR_PRESETS[FireworkColor.RED].swatch]);
  });

  it("embers burst in the chosen colour", () => {
    const sim = new Simulation({ width: 400, height: 400, cellSize: 4, seed: 10 });
    sim.setFireworkColor(FireworkColor.BLUE);
    sim.launchFromDrag(200, 380, 200, 280);
    tickUntilEmbersAppear(sim);

    const burst = embers(sim);
    expect(burst.length).toBeGreaterThan(10);
    for (const p of burst) {
      expect(p.fireworkColor).toBe(FireworkColor.BLUE);
      expect(inPreset(p, FireworkColor.BLUE)).toBe(true);
    }
  });

  it("rockets in flight together each burst in the colour picked at their own launch", () => {
    const sim = new Simulation({ width: 400, height: 800, cellSize: 4, seed: 11 });
    sim.setFireworkColor(FireworkColor.RED);
    sim.launchFromDrag(100, 780, 100, 380); // high
    sim.setFireworkColor(FireworkColor.GREEN);
    sim.launchFromDrag(300, 780, 300, 700); // lower, bursts first
    expect(rockets(sim).length).toBe(2);

    const seen = new Set<number>();
    for (let i = 0; i < 600 && (rockets(sim).length > 0 || seen.size < 2); i++) {
      sim.tick(1 / 60);
      for (const p of embers(sim)) {
        expect(inPreset(p, p.fireworkColor as FireworkColorValue)).toBe(true);
        seen.add(p.fireworkColor);
      }
    }
    expect(seen).toEqual(new Set([FireworkColor.RED, FireworkColor.GREEN]));
  });

  it("crossette sub-embers inherit their parent's colour", () => {
    const sim = new Simulation({ width: 400, height: 400, cellSize: 4, seed: 5 });
    sim.setFireworkPattern(FireworkPattern.CROSSETTE);
    sim.setFireworkColor(FireworkColor.PURPLE);
    sim.launchFromDrag(200, 380, 200, 280);
    tickUntilEmbersAppear(sim);
    for (let i = 0; i < 50; i++) sim.tick(1 / 60);

    const subEmbers = embers(sim).filter((p) => p.behavior === EmberBehavior.NONE);
    expect(subEmbers.length).toBeGreaterThan(0);
    for (const p of subEmbers) {
      expect(p.fireworkColor).toBe(FireworkColor.PURPLE);
      expect(inPreset(p, FireworkColor.PURPLE)).toBe(true);
    }
  });

  it("picking a colour makes the same RNG draws as gold, so motion is identical", () => {
    const motion = (color: FireworkColorValue): number[][] => {
      const sim = new Simulation({ width: 400, height: 400, cellSize: 4, seed: 5 });
      sim.setFireworkPattern(FireworkPattern.CROSSETTE); // includes the sub-ember draws too
      sim.setFireworkColor(color);
      sim.launchFromDrag(200, 380, 200, 280);
      tickUntilEmbersAppear(sim);
      for (let i = 0; i < 50; i++) sim.tick(1 / 60);
      return embers(sim).map((p) => [p.x, p.y, p.vx, p.vy, p.radius, p.lifespan]);
    };
    expect(motion(FireworkColor.PURPLE)).toEqual(motion(FireworkColor.GOLD));
  });
});

describe("Fireworks: wind zones", () => {
  it("embers bursting inside a zone drift in the zone's direction", () => {
    const meanEmberX = (withZone: boolean): number => {
      const sim = new Simulation({ width: 400, height: 400, cellSize: 4, seed: 3 });
      sim.launchFromDrag(200, 380, 200, 280);
      tickUntilEmbersAppear(sim);
      // Added only after the burst, so the rocket's own path is identical in both runs.
      if (withZone) {
        sim.setZoneStrength(-800);
        sim.addWindZoneFromDrag(0, 0, 399, 399);
      }
      for (let i = 0; i < 20; i++) sim.tick(1 / 60);
      const burst = embers(sim);
      return burst.reduce((sum, p) => sum + p.x, 0) / burst.length;
    };
    expect(meanEmberX(true)).toBeLessThan(meanEmberX(false) - 5);
  });
});

describe("Fireworks: grid ignition", () => {
  it("a low-height burst over flammable material ignites it", () => {
    const sim = new Simulation({ width: 200, height: 200, cellSize: 4, seed: 7 });
    const groundRow = sim.grid.height - 5;
    for (let gx = 0; gx < sim.grid.width; gx++) sim.grid.setMaterial(gx, groundRow, Material.WOOD);

    sim.setFireworkPattern(FireworkPattern.RING);
    sim.setMode("launch");
    const launchX = sim.width / 2;
    const launchY = (groundRow - 10) * sim.cellSize;
    sim.launchFromDrag(launchX, launchY, launchX, launchY); // zero drag -> lowest burst

    // Checked every tick, not just at the end: fire burns itself out after a
    // few seconds, so a check only after many ticks could miss ignition that
    // already happened and finished.
    let ignited = false;
    for (let i = 0; i < 300 && !ignited; i++) {
      sim.tick(1 / 60);
      for (let gx = 0; gx < sim.grid.width; gx++) {
        if (sim.grid.get(gx, groundRow) === Material.FIRE) ignited = true;
      }
    }
    expect(ignited).toBe(true);
  });

  it("a low-height burst over sand or stone ignites nothing", () => {
    const sim = new Simulation({ width: 200, height: 200, cellSize: 4, seed: 8 });
    const groundRow = sim.grid.height - 5;
    for (let gx = 0; gx < sim.grid.width; gx++) sim.grid.setMaterial(gx, groundRow, Material.STONE);

    sim.setFireworkPattern(FireworkPattern.RING);
    sim.setMode("launch");
    const launchX = sim.width / 2;
    const launchY = (groundRow - 10) * sim.cellSize;
    sim.launchFromDrag(launchX, launchY, launchX, launchY);

    for (let i = 0; i < 300; i++) sim.tick(1 / 60);

    for (let gx = 0; gx < sim.grid.width; gx++) {
      expect(sim.grid.get(gx, groundRow)).toBe(Material.STONE);
    }
  });
});
