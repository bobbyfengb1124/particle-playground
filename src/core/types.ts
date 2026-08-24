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
