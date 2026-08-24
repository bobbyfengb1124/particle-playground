import { describe, expect, it } from "vitest";
import { applyDrag, applyGravity, applyWind } from "../../src/particles/forces";
import { Particle } from "../../src/particles/Particle";

describe("forces", () => {
  it("applyGravity adds a downward acceleration", () => {
    const p = new Particle();
    applyGravity(p, 500);
    expect(p.ay).toBe(500);
  });

  it("applyWind adds a horizontal acceleration, positive or negative", () => {
    const right = new Particle();
    applyWind(right, 120);
    expect(right.ax).toBe(120);

    const left = new Particle();
    applyWind(left, -80);
    expect(left.ax).toBe(-80);
  });

  it("applyDrag opposes velocity, proportional to speed and dragCoef", () => {
    const p = new Particle();
    p.vx = 100;
    p.vy = -50;
    p.dragCoef = 0.5;
    applyDrag(p);
    expect(p.ax).toBe(-50);
    expect(p.ay).toBe(25);
  });

  it("applyDrag contributes nothing when velocity is zero", () => {
    const p = new Particle();
    p.dragCoef = 2;
    applyDrag(p);
    expect(p.ax).toBe(0);
    expect(p.ay).toBe(0);
  });

  it("forces accumulate onto existing acceleration rather than overwrite it", () => {
    const p = new Particle();
    applyGravity(p, 500);
    applyWind(p, 100);
    expect(p.ax).toBe(100);
    expect(p.ay).toBe(500);
  });
});
