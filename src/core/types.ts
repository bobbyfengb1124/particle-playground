export const ParticleKind = {
  GENERIC: 0,
  ROCKET: 1,
  EMBER: 2,
} as const;
export type ParticleKindValue = (typeof ParticleKind)[keyof typeof ParticleKind];

export const EmberBehavior = {
  NONE: 0,
  STROBE: 1,
  CROSSETTE: 2,
} as const;
export type EmberBehaviorValue = (typeof EmberBehavior)[keyof typeof EmberBehavior];

/**
 * A rocket carries its chosen burst style in its own (otherwise-unused, for
 * ROCKET-kind particles) `behavior` field until it reaches apex, at which
 * point fireworks.ts reads it back to decide how to burst.
 */
export const FireworkPattern = {
  RING: 0,
  WILLOW: 1,
  CROSSETTE: 2,
  STROBE: 3,
} as const;
export type FireworkPatternValue = (typeof FireworkPattern)[keyof typeof FireworkPattern];

/**
 * Burst colour picked per launch. A rocket carries it in `fireworkColor` and
 * passes it on to its embers, so rockets in flight together can burst in
 * different colours. GOLD is 0 so a freshly reset particle defaults to the
 * original orange/gold look.
 */
export const FireworkColor = {
  GOLD: 0,
  RED: 1,
  GREEN: 2,
  BLUE: 3,
  PURPLE: 4,
  WHITE: 5,
} as const;
export type FireworkColorValue = (typeof FireworkColor)[keyof typeof FireworkColor];
