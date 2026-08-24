import { describe, expect, it } from "vitest";
import { Simulation } from "../../src/app/Simulation";
import { runTicks } from "./helpers/headlessRunner";
import { serializeParticles } from "./helpers/serialize";

describe("particle spawn, integration, and fade/expiry", () => {
  it("spawns particles at the click point and they drift deterministically", () => {
    const sim = new Simulation({ width: 200, height: 200, seed: 7 });
    sim.spawnParticlesAt(100, 100, 5);
    expect(sim.particles.activeCount).toBe(5);
    runTicks(sim, 10);
    expect(serializeParticles(sim.particles)).toMatchSnapshot();
  });

  it("removes particles once their lifespan expires, rather than accumulating forever", () => {
    const sim = new Simulation({ width: 200, height: 200, seed: 7 });
    sim.spawnParticlesAt(100, 100, 5);
    runTicks(sim, 200); // well past the max ~1.6s (96-tick) spawn lifespan
    expect(sim.particles.activeCount).toBe(0);
  });

  it("does not grow unbounded under rapid repeated spawning at one spot", () => {
    const sim = new Simulation({ width: 200, height: 200, seed: 7, particleCapacity: 500 });
    for (let i = 0; i < 100; i++) {
      sim.spawnParticlesAt(50, 50, 8);
      runTicks(sim, 5);
    }
    expect(sim.particles.activeCount).toBeLessThanOrEqual(500);
  });

  it("respects pause: no integration or expiry happens while paused", () => {
    const sim = new Simulation({ width: 200, height: 200, seed: 7 });
    sim.spawnParticlesAt(100, 100, 3);
    sim.pause();
    runTicks(sim, 30);
    expect(serializeParticles(sim.particles)).toEqual(
      (() => {
        const fresh = new Simulation({ width: 200, height: 200, seed: 7 });
        fresh.spawnParticlesAt(100, 100, 3);
        return serializeParticles(fresh.particles);
      })(),
    );
  });
});
