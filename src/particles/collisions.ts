import type { Particle } from "./Particle";

export interface Bounds {
  width: number;
  height: number;
}

/** Reflects velocity and repositions the particle when it crosses a canvas edge or the floor, damping speed by restitution. */
export function applyBoundsCollision(p: Particle, bounds: Bounds): void {
  if (p.x - p.radius < 0) {
    p.x = p.radius;
    p.vx = -p.vx * p.restitution;
  } else if (p.x + p.radius > bounds.width) {
    p.x = bounds.width - p.radius;
    p.vx = -p.vx * p.restitution;
  }

  if (p.y - p.radius < 0) {
    p.y = p.radius;
    p.vy = -p.vy * p.restitution;
  } else if (p.y + p.radius > bounds.height) {
    p.y = bounds.height - p.radius;
    p.vy = -p.vy * p.restitution;
  }
}
