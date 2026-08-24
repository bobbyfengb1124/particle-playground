export const Material = {
  EMPTY: 0,
  SAND: 1,
} as const;
export type MaterialIdValue = (typeof Material)[keyof typeof Material];

export interface MaterialInfo {
  name: string;
  /** Single ASCII character used by grid snapshot serialization. */
  symbol: string;
  /** RGB, used by GridRenderer's color lookup table. */
  color: readonly [number, number, number];
}

/** Indexed by MaterialId — kept as a plain array (not a Record) since ids are small sequential ints. */
export const MATERIALS: readonly MaterialInfo[] = [
  { name: "empty", symbol: ".", color: [0, 0, 0] },
  { name: "sand", symbol: "s", color: [214, 178, 107] },
];
