import { MAX_WIND_ZONES, ZONE_WIND_MAX, type WindZone } from "../wind/WindField";
import type { Grid } from "./Grid";
import { Material, MATERIALS } from "./materials";

/** Cell size of the original grid, and of every file saved before Step 17 (which have no cellSize field). */
export const REFERENCE_CELL_SIZE = 4;
const ALLOWED_CELL_SIZES = [1, 2, 4];

export interface SceneData {
  width: number;
  height: number;
  /** Pixels per cell. Absent in files saved before Step 17, which are all REFERENCE_CELL_SIZE. */
  cellSize?: number;
  material: number[];
  timer: number[];
  /** Absent in files saved before Step 14; parseScene normalizes a missing field to []. */
  windZones?: WindZone[];
}

export type SceneParseResult = { ok: true; scene: SceneData } | { ok: false; error: string };

/** Reads a grid's per-cell material+timer (plus any drawn wind zones) into a plain JSON-serializable snapshot. */
export function serializeScene(grid: Grid, windZones: readonly WindZone[] = [], cellSize = REFERENCE_CELL_SIZE): SceneData {
  return {
    width: grid.width,
    height: grid.height,
    cellSize,
    material: Array.from(grid.material),
    timer: Array.from(grid.timer),
    windZones: windZones.map((z) => ({ ...z })),
  };
}

/**
 * Converts a timer so the cell is at the same point in its life on a grid
 * `factor` times finer (factor > 1) or coarser (factor < 1). Fire, smoke,
 * and steam count ticks, which scale with tickScale; a seed's stage (high
 * byte) scales with the height cap, but its watered ticks (low byte) don't.
 * No other material uses its timer.
 */
function scaleTimer(id: number, timer: number, factor: number): number {
  switch (id) {
    case Material.FIRE:
    case Material.SMOKE:
    case Material.STEAM:
      return Math.min(65535, Math.floor(timer * factor));
    case Material.SEED:
      return (Math.floor((timer >> 8) * factor) << 8) | (timer & 0xff);
    default:
      return timer;
  }
}

/**
 * Re-grids a validated scene from `fromCell` px cells to `toCell` px cells
 * (an integer ratio either way). Going finer, each cell becomes a ratio×ratio
 * block; going coarser, each block keeps its top-left cell. Zones keep
 * covering the same pixels — rounded outward when coarsening, so none
 * vanishes — and strength is unchanged since it's in px/s^2, not cells.
 */
export function resampleScene(scene: SceneData, fromCell: number, toCell: number): SceneData {
  if (fromCell === toCell) return { ...scene, cellSize: toCell };
  const finer = fromCell > toCell;
  const ratio = finer ? fromCell / toCell : toCell / fromCell;
  const factor = finer ? ratio : 1 / ratio;
  const width = finer ? scene.width * ratio : scene.width / ratio;
  const height = finer ? scene.height * ratio : scene.height / ratio;
  const material: number[] = new Array(width * height);
  const timer: number[] = new Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const src = finer ? Math.floor(y / ratio) * scene.width + Math.floor(x / ratio) : y * ratio * scene.width + x * ratio;
      const id = scene.material[src];
      material[y * width + x] = id;
      timer[y * width + x] = scaleTimer(id, scene.timer[src], factor);
    }
  }
  const windZones = (scene.windZones ?? []).map((z) => {
    if (finer) return { gx: z.gx * ratio, gy: z.gy * ratio, gw: z.gw * ratio, gh: z.gh * ratio, strength: z.strength };
    const gx = Math.floor(z.gx / ratio);
    const gy = Math.floor(z.gy / ratio);
    return { gx, gy, gw: Math.ceil((z.gx + z.gw) / ratio) - gx, gh: Math.ceil((z.gy + z.gh) / ratio) - gy, strength: z.strength };
  });
  return { width, height, cellSize: toCell, material, timer, windZones };
}

function isValidWindZone(value: unknown, width: number, height: number): value is WindZone {
  if (!isPlainObject(value)) return false;
  const { gx, gy, gw, gh, strength } = value;
  if (![gx, gy, gw, gh].every(Number.isInteger)) return false;
  const [x, y, w, h] = [gx, gy, gw, gh] as number[];
  if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > width || y + h > height) return false;
  return typeof strength === "number" && Number.isFinite(strength) && Math.abs(strength) <= ZONE_WIND_MAX;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isIntegerArrayInRange(value: unknown, min: number, max: number): value is number[] {
  return Array.isArray(value) && value.every((n) => Number.isInteger(n) && n >= min && n <= max);
}

/**
 * Parses and validates a saved-scene JSON string against a target grid's
 * dimensions and cell size, resampling it when the file was saved at a
 * different cell size but covers the same pixels. Pure — never touches a Grid.
 */
export function parseScene(json: string, width: number, height: number, cellSize = REFERENCE_CELL_SIZE): SceneParseResult {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, error: "Could not load file: not a valid JSON file." };
  }

  if (
    !isPlainObject(data) ||
    typeof data.width !== "number" ||
    typeof data.height !== "number" ||
    !Array.isArray(data.material) ||
    !Array.isArray(data.timer)
  ) {
    return { ok: false, error: "Could not load file: not a recognized scene file." };
  }

  const fileCell = data.cellSize ?? REFERENCE_CELL_SIZE;
  if (typeof fileCell !== "number" || !ALLOWED_CELL_SIZES.includes(fileCell)) {
    return { ok: false, error: "Could not load file: grid data is corrupted (invalid cell size)." };
  }

  if (data.width * fileCell !== width * cellSize || data.height * fileCell !== height * cellSize) {
    return {
      ok: false,
      error: `Could not load file: saved grid is ${data.width}x${data.height}, but the current grid is ${width}x${height}.`,
    };
  }

  // Everything below validates at the file's own resolution; resampling happens last.
  const fileWidth = data.width;
  const fileHeight = data.height;
  const cellCount = fileWidth * fileHeight;
  if (data.material.length !== cellCount || data.timer.length !== cellCount) {
    return { ok: false, error: "Could not load file: grid data is corrupted (wrong array length)." };
  }

  if (!isIntegerArrayInRange(data.material, 0, MATERIALS.length - 1)) {
    return { ok: false, error: "Could not load file: grid data is corrupted (invalid material id)." };
  }

  if (!isIntegerArrayInRange(data.timer, 0, 65535)) {
    return { ok: false, error: "Could not load file: grid data is corrupted (invalid timer value)." };
  }

  let windZones: WindZone[] = [];
  if (data.windZones !== undefined) {
    const zones = data.windZones;
    if (!Array.isArray(zones) || zones.length > MAX_WIND_ZONES || !zones.every((z) => isValidWindZone(z, fileWidth, fileHeight))) {
      return { ok: false, error: "Could not load file: wind zone data is corrupted." };
    }
    windZones = zones.map((z: WindZone) => ({ gx: z.gx, gy: z.gy, gw: z.gw, gh: z.gh, strength: z.strength }));
  }

  const scene: SceneData = { width: fileWidth, height: fileHeight, cellSize: fileCell, material: data.material, timer: data.timer, windZones };
  return { ok: true, scene: resampleScene(scene, fileCell, cellSize) };
}

/** Clears `grid` and repopulates every cell from an already-validated scene. */
export function applyScene(grid: Grid, scene: SceneData): void {
  grid.clear();
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const idx = grid.index(x, y);
      grid.transformMaterial(x, y, scene.material[idx], scene.timer[idx]);
    }
  }
}
