export const Material = {
  EMPTY: 0,
  SAND: 1,
  STONE: 2,
  WATER: 3,
  OIL: 4,
  WOOD: 5,
  FIRE: 6,
  SMOKE: 7,
  STEAM: 8,
} as const;
export type MaterialIdValue = (typeof Material)[keyof typeof Material];

export interface MaterialInfo {
  name: string;
  /** Single ASCII character used by grid snapshot serialization. */
  symbol: string;
  /** RGB, used by GridRenderer's color lookup table. */
  color: readonly [number, number, number];
  /**
   * Liquids only. When a liquid's rule checks a neighboring cell and finds
   * another liquid with a lower density, it swaps into it (sinks below it)
   * instead of stopping — this is how oil ends up floating on water
   * regardless of which was placed first. Undefined for non-liquids: solids
   * neither displace nor get displaced by density.
   */
  density?: number;
  /** Whether fire's rule ignites this material on contact (wood, oil). Undefined/false for everything else. */
  flammable?: boolean;
}

/** Indexed by MaterialId — kept as a plain array (not a Record) since ids are small sequential ints. */
export const MATERIALS: readonly MaterialInfo[] = [
  { name: "empty", symbol: ".", color: [0, 0, 0] },
  { name: "sand", symbol: "s", color: [214, 178, 107] },
  { name: "stone", symbol: "#", color: [120, 120, 120] },
  { name: "water", symbol: "w", color: [64, 120, 220], density: 2 },
  { name: "oil", symbol: "o", color: [120, 92, 40], density: 1, flammable: true },
  { name: "wood", symbol: "^", color: [110, 74, 40], flammable: true },
  { name: "fire", symbol: "f", color: [226, 88, 34] },
  { name: "smoke", symbol: "m", color: [100, 100, 100] },
  { name: "steam", symbol: "t", color: [214, 224, 232] },
];
