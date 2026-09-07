import type { Rng } from "../core/Rng";
import { range } from "../core/Rng";
import { EmberBehavior, FireworkPattern, ParticleKind } from "../core/types";
import type { Particle } from "./Particle";
import type { ParticleSystem } from "./ParticleSystem";

const EMBER_COUNT = 24;
const CROSSETTE_SUB_EMBER_COUNT = 7;
const EMBER_BASE_SPEED = 130; // px/s
const EMBER_BASE_DRAG = 0.6; // 1/s
const EMBER_LIFESPAN = 1.4; // s

const WILLOW_DRAG_MULTIPLIER = 2;
const WILLOW_GRAVITY_SCALE = 1.6;

const CROSSETTE_SPLIT_FRACTION = 0.45; // fraction of lifespan at which an ember splits
const STROBE_FLICKER_PERIOD = 0.09; // s per visible/invisible phase

/** Spawns a rocket straight up from (x, y); it carries `pattern` in its own behavior slot until fireworks.ts reads it back at apex. */
export function launchRocket(particles: ParticleSystem, x: number, y: number, speed: number, pattern: number): void {
  particles.spawn({
    x,
    y,
    vx: 0,
    vy: -speed,
    radius: 3,
    colorR: 255,
    colorG: 230,
    colorB: 160,
    lifespan: 12, // generous cap; apex detection removes the rocket long before this
    dragCoef: 0,
    kind: ParticleKind.ROCKET,
    behavior: pattern,
  });
}

/** Spawns `count` embers evenly spaced around a full circle, each velocity offset by `base` (for a crossette child inheriting its parent's motion). */
function spawnEmberRing(
  particles: ParticleSystem,
  x: number,
  y: number,
  count: number,
  speed: number,
  behavior: number,
  dragCoef: number,
  gravityScale: number,
  rng: Rng,
  base: { vx: number; vy: number } = { vx: 0, vy: 0 },
): void {
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + range(rng, -0.05, 0.05);
    const s = speed * range(rng, 0.85, 1.15);
    particles.spawn({
      x,
      y,
      vx: base.vx + Math.cos(angle) * s,
      vy: base.vy + Math.sin(angle) * s,
      radius: range(rng, 1.2, 2.2),
      colorR: 255,
      colorG: Math.round(range(rng, 140, 200)),
      colorB: Math.round(range(rng, 40, 100)),
      lifespan: range(rng, EMBER_LIFESPAN * 0.8, EMBER_LIFESPAN * 1.2),
      dragCoef,
      restitution: 0.35,
      gravityScale,
      kind: ParticleKind.EMBER,
      behavior,
      behaviorTimer: behavior === EmberBehavior.STROBE ? STROBE_FLICKER_PERIOD : 0,
      behaviorFlag: behavior === EmberBehavior.STROBE ? 1 : 0,
    });
  }
}

/** Bursts a shell at (x, y) into embers matching the chosen firework pattern. */
export function burst(particles: ParticleSystem, x: number, y: number, pattern: number, rng: Rng): void {
  switch (pattern) {
    case FireworkPattern.WILLOW:
      spawnEmberRing(
        particles, x, y, EMBER_COUNT, EMBER_BASE_SPEED,
        EmberBehavior.NONE, EMBER_BASE_DRAG * WILLOW_DRAG_MULTIPLIER, WILLOW_GRAVITY_SCALE, rng,
      );
      break;
    case FireworkPattern.CROSSETTE:
      spawnEmberRing(particles, x, y, EMBER_COUNT, EMBER_BASE_SPEED, EmberBehavior.CROSSETTE, EMBER_BASE_DRAG, 1, rng);
      break;
    case FireworkPattern.STROBE:
      spawnEmberRing(particles, x, y, EMBER_COUNT, EMBER_BASE_SPEED, EmberBehavior.STROBE, EMBER_BASE_DRAG, 1, rng);
      break;
    case FireworkPattern.RING:
    default:
      spawnEmberRing(particles, x, y, EMBER_COUNT, EMBER_BASE_SPEED, EmberBehavior.NONE, EMBER_BASE_DRAG, 1, rng);
      break;
  }
}

/**
 * Per-tick firework logic, called after ParticleSystem.update has integrated
 * physics: detects a rocket reaching apex (vy crossing back to non-negative)
 * and bursts it, and ages ember behaviors (crossette's one-shot secondary
 * burst, strobe's flicker). All spawns/releases are deferred until after the
 * read-only scan, since acquiring/releasing pool slots mid-`forEachActive`
 * would skip or double-visit entries.
 */
export function updateFireworkBehaviors(particles: ParticleSystem, dt: number, rng: Rng): void {
  const rocketBursts: Array<{ x: number; y: number; pattern: number }> = [];
  const rocketsToRelease: Particle[] = [];
  const crossetteSplits: Array<{ x: number; y: number; vx: number; vy: number }> = [];

  particles.forEachActive((p) => {
    if (p.kind === ParticleKind.ROCKET) {
      if (p.vy >= 0) {
        rocketBursts.push({ x: p.x, y: p.y, pattern: p.behavior });
        rocketsToRelease.push(p);
      }
      return;
    }
    if (p.kind !== ParticleKind.EMBER) return;

    if (p.behavior === EmberBehavior.STROBE) {
      p.behaviorTimer -= dt;
      if (p.behaviorTimer <= 0) {
        p.behaviorFlag = p.behaviorFlag === 0 ? 1 : 0;
        p.behaviorTimer += STROBE_FLICKER_PERIOD;
      }
    } else if (p.behavior === EmberBehavior.CROSSETTE && p.behaviorFlag === 0 && p.age >= p.lifespan * CROSSETTE_SPLIT_FRACTION) {
      p.behaviorFlag = 1; // one-shot guard so a crossette ember only ever splits once
      crossetteSplits.push({ x: p.x, y: p.y, vx: p.vx, vy: p.vy });
    }
  });

  for (const split of crossetteSplits) {
    spawnEmberRing(
      particles, split.x, split.y, CROSSETTE_SUB_EMBER_COUNT, EMBER_BASE_SPEED * 0.6,
      EmberBehavior.NONE, EMBER_BASE_DRAG, 1, rng, { vx: split.vx, vy: split.vy },
    );
  }
  for (const rocket of rocketBursts) burst(particles, rocket.x, rocket.y, rocket.pattern, rng);
  for (const p of rocketsToRelease) particles.release(p);
}
