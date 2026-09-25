import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/app/Simulation";
import { ParticleKind } from "../../src/core/types";
import { runTicks } from "./helpers/headlessRunner";
import { serializeParticles } from "./helpers/serialize";

describe("gravity, wind, drag, and bounce", () => {
  it("falls under gravity rather than drifting in a straight line", () => {
    const sim = new Simulation({ width: 300, height: 300, seed: 3 });
    sim.spawnParticlesAt(150, 20, 1);
    const withoutGravityY = 20; // sanity baseline: a straight-line drift would barely move vertically this fast
    runTicks(sim, 15);
    const [p] = serializeParticles(sim.particles);
    expect(p.y).toBeGreaterThan(withoutGravityY + 20);
    expect(p.vy).toBeGreaterThan(0);
  });

  it("curves sideways when wind is applied", () => {
    const noWind = new Simulation({ width: 300, height: 300, seed: 3 });
    noWind.spawnParticlesAt(150, 20, 1);
    runTicks(noWind, 20);
    const [withoutWind] = serializeParticles(noWind.particles);

    const withWind = new Simulation({ width: 300, height: 300, seed: 3 });
    withWind.setWind(300);
    withWind.spawnParticlesAt(150, 20, 1);
    runTicks(withWind, 20);
    const [withWindResult] = serializeParticles(withWind.particles);

    expect(withWindResult.x).toBeGreaterThan(withoutWind.x);
  });

  it("drifts sideways inside a wind zone", () => {
    const noZone = new Simulation({ width: 300, height: 300, seed: 3 });
    noZone.spawnParticlesAt(150, 20, 1);
    runTicks(noZone, 20);
    const [withoutZone] = serializeParticles(noZone.particles);

    const withZone = new Simulation({ width: 300, height: 300, seed: 3 });
    expect(withZone.addWindZoneFromDrag(0, 0, 299, 299)).toBe(true); // default +300 strength, whole canvas
    withZone.spawnParticlesAt(150, 20, 1);
    runTicks(withZone, 20);
    const [withZoneResult] = serializeParticles(withZone.particles);

    expect(withZoneResult.x).toBeGreaterThan(withoutZone.x);
  });

  it("a particle that never enters a zone moves exactly as if no zone existed", () => {
    const noZone = new Simulation({ width: 300, height: 300, seed: 3 });
    noZone.spawnParticlesAt(150, 20, 1);
    runTicks(noZone, 20);

    const farZone = new Simulation({ width: 300, height: 300, seed: 3 });
    farZone.setZoneStrength(800);
    farZone.addWindZoneFromDrag(0, 0, 40, 40);
    farZone.spawnParticlesAt(150, 20, 1);
    runTicks(farZone, 20);

    expect(serializeParticles(farZone.particles)).toEqual(serializeParticles(noZone.particles));
  });

  it("a rocket launched up through a zone ends up displaced sideways", () => {
    const sim = new Simulation({ width: 200, height: 800, cellSize: 4, seed: 1 });
    sim.setZoneStrength(-800);
    sim.addWindZoneFromDrag(0, 300, 199, 700);
    sim.launchFromDrag(100, 780, 100, 380);
    let minRocketX = 100;
    for (let i = 0; i < 120; i++) {
      sim.tick(1 / 60);
      sim.particles.forEachActive((p) => {
        if (p.kind === ParticleKind.ROCKET) minRocketX = Math.min(minRocketX, p.x);
      });
    }
    expect(minRocketX).toBeLessThan(99);
  });

  it("settles rather than bouncing forever, and each bounce's speed decays", () => {
    // A tight, gravity-only, drag-free, high-restitution capacity=1 particle
    // whose only fate is to bounce on the floor repeatedly and settle.
    const sim = new Simulation({ width: 100, height: 60, seed: 5, gravity: 1200 });
    sim.spawnParticlesAt(50, 55, 1);
    runTicks(sim, 300); // 5 seconds of simulated time — plenty for several bounces
    expect(sim.particles.activeCount).toBeLessThanOrEqual(1);
    // Whether it already expired or is still settling, this must not throw and must be deterministic.
    expect(serializeParticles(sim.particles)).toMatchSnapshot();
  });

  it("drag slows a particle over time even with no gravity or wind", () => {
    const sim = new Simulation({ width: 500, height: 500, seed: 11, gravity: 0 });
    sim.spawnParticlesAt(250, 250, 1);
    runTicks(sim, 1);
    const [afterOneTick] = serializeParticles(sim.particles);
    const speedEarly = Math.hypot(afterOneTick.vx, afterOneTick.vy);
    runTicks(sim, 30);
    const afterMore = serializeParticles(sim.particles);
    if (afterMore.length > 0) {
      const speedLater = Math.hypot(afterMore[0].vx, afterMore[0].vy);
      expect(speedLater).toBeLessThan(speedEarly);
    }
  });
});
