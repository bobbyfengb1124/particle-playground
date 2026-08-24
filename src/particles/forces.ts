import type { Particle } from "./Particle";

/** Accumulates a constant downward acceleration onto the particle. */
export function applyGravity(p: Particle, gravity: number): void {
  p.ay += gravity;
}

/** Accumulates a constant horizontal acceleration onto the particle. */
export function applyWind(p: Particle, wind: number): void {
  p.ax += wind;
}

/** Accumulates an acceleration opposing velocity, proportional to speed and the particle's own drag coefficient. */
export function applyDrag(p: Particle): void {
  p.ax -= p.vx * p.dragCoef;
  p.ay -= p.vy * p.dragCoef;
}
