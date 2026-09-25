/** Strongest wind a zone (or several overlapping zones summed together) can produce, in px/s^2. */
export const ZONE_WIND_MAX = 800;
/** Cap on how many zones can exist at once — drags past it are ignored. */
export const MAX_WIND_ZONES = 32;

/** A drawn rectangle of extra horizontal wind, stored in grid-cell units so particles and gas read the same field. */
export interface WindZone {
  gx: number;
  gy: number;
  gw: number;
  gh: number;
  /** Signed horizontal acceleration in px/s^2, fixed when the zone was drawn. */
  strength: number;
}

export function clampWind(w: number): number {
  return Math.max(-ZONE_WIND_MAX, Math.min(ZONE_WIND_MAX, w));
}

/**
 * Turns a pointer drag (canvas pixels, any corner order) into a cell-snapped
 * zone clamped to the grid. Returns null for a drag that stays inside one
 * cell (a plain click) or a zero-strength zone, since neither would do anything.
 */
export function normalizeZoneRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cellSize: number,
  gridW: number,
  gridH: number,
  strength: number,
): WindZone | null {
  if (strength === 0) return null;
  const clampX = (gx: number): number => Math.max(0, Math.min(gridW - 1, gx));
  const clampY = (gy: number): number => Math.max(0, Math.min(gridH - 1, gy));
  const ax = clampX(Math.floor(x0 / cellSize));
  const bx = clampX(Math.floor(x1 / cellSize));
  const ay = clampY(Math.floor(y0 / cellSize));
  const by = clampY(Math.floor(y1 / cellSize));
  if (ax === bx && ay === by) return null;
  const gx = Math.min(ax, bx);
  const gy = Math.min(ay, by);
  return { gx, gy, gw: Math.max(ax, bx) - gx + 1, gh: Math.max(ay, by) - gy + 1, strength };
}

/** Per-cell sum of every zone's strength, clamped to ±ZONE_WIND_MAX. Read by particles (by pixel) and the gas rule (by cell index). */
export class WindField {
  readonly values: Float32Array;

  constructor(
    readonly width: number,
    readonly height: number,
    readonly cellSize: number,
  ) {
    this.values = new Float32Array(width * height);
  }

  rebuild(zones: readonly WindZone[]): void {
    this.values.fill(0);
    for (const z of zones) {
      for (let y = z.gy; y < z.gy + z.gh; y++) {
        for (let x = z.gx; x < z.gx + z.gw; x++) this.values[y * this.width + x] += z.strength;
      }
    }
    for (let i = 0; i < this.values.length; i++) this.values[i] = clampWind(this.values[i]);
  }

  atCell(idx: number): number {
    return this.values[idx];
  }

  /** Field value under a canvas pixel position; 0 outside the grid (e.g. a rocket that flew off the top). */
  atPixel(x: number, y: number): number {
    const gx = Math.floor(x / this.cellSize);
    const gy = Math.floor(y / this.cellSize);
    if (gx < 0 || gy < 0 || gx >= this.width || gy >= this.height) return 0;
    return this.values[gy * this.width + gx];
  }
}
