import { describe, expect, it } from "vitest";
import { applyBoundsCollision } from "../../src/particles/collisions";
import { Particle } from "../../src/particles/Particle";

const bounds = { width: 200, height: 100 };

describe("applyBoundsCollision", () => {
  it("reflects and damps velocity when hitting the floor", () => {
    const p = new Particle();
    p.x = 50;
    p.y = 98;
    p.radius = 4;
    p.vy = 120;
    p.restitution = 0.5;
    applyBoundsCollision(p, bounds);
    expect(p.y).toBe(bounds.height - p.radius);
    expect(p.vy).toBe(-60);
  });

  it("reflects and damps velocity when hitting the ceiling", () => {
    const p = new Particle();
    p.x = 50;
    p.y = 2;
    p.radius = 4;
    p.vy = -80;
    p.restitution = 0.5;
    applyBoundsCollision(p, bounds);
    expect(p.y).toBe(p.radius);
    expect(p.vy).toBe(40);
  });

  it("reflects off the left and right edges", () => {
    const left = new Particle();
    left.x = 1;
    left.y = 50;
    left.radius = 4;
    left.vx = -60;
    left.restitution = 0.5;
    applyBoundsCollision(left, bounds);
    expect(left.x).toBe(left.radius);
    expect(left.vx).toBe(30);

    const right = new Particle();
    right.x = bounds.width - 1;
    right.y = 50;
    right.radius = 4;
    right.vx = 60;
    right.restitution = 0.5;
    applyBoundsCollision(right, bounds);
    expect(right.x).toBe(bounds.width - right.radius);
    expect(right.vx).toBe(-30);
  });

  it("does nothing when comfortably inside the bounds", () => {
    const p = new Particle();
    p.x = 100;
    p.y = 50;
    p.vx = 10;
    p.vy = -10;
    applyBoundsCollision(p, bounds);
    expect(p.x).toBe(100);
    expect(p.y).toBe(50);
    expect(p.vx).toBe(10);
    expect(p.vy).toBe(-10);
  });

  it("each bounce multiplies speed by restitution, so peak height decays geometrically", () => {
    const p = new Particle();
    p.x = 50;
    p.radius = 2;
    p.restitution = 0.6;

    p.y = bounds.height;
    p.vy = 200;
    applyBoundsCollision(p, bounds);
    expect(p.vy).toBeCloseTo(-120, 10);

    p.y = bounds.height;
    p.vy = -p.vy; // falls back down under gravity between bounces
    applyBoundsCollision(p, bounds);
    expect(p.vy).toBeCloseTo(-72, 10);
  });
});
