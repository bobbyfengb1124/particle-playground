import { describe, expect, it } from "vitest";
import { ParticleSystem } from "../../src/particles/ParticleSystem";

describe("ParticleSystem capacity", () => {
  it("refuses to spawn past capacity and activeCount never exceeds it", () => {
    const system = new ParticleSystem(3);
    expect(system.capacity).toBe(3);

    expect(system.spawn({ x: 0, y: 0 })).not.toBeNull();
    expect(system.spawn({ x: 0, y: 0 })).not.toBeNull();
    expect(system.spawn({ x: 0, y: 0 })).not.toBeNull();
    expect(system.activeCount).toBe(3);

    expect(system.spawn({ x: 0, y: 0 })).toBeNull();
    expect(system.activeCount).toBe(3);
  });

  it("releasing a particle frees a slot for a subsequent spawn", () => {
    const system = new ParticleSystem(1);
    const p = system.spawn({ x: 0, y: 0 });
    expect(p).not.toBeNull();
    expect(system.spawn({ x: 0, y: 0 })).toBeNull();

    system.release(p!);
    expect(system.activeCount).toBe(0);
    expect(system.spawn({ x: 0, y: 0 })).not.toBeNull();
  });
});
