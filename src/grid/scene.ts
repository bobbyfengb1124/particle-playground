import { MAX_WIND_ZONES, ZONE_WIND_MAX, type WindZone } from "../wind/WindField";
import type { Grid } from "./Grid";
import { MATERIALS } from "./materials";

export interface SceneData {
  width: number;
  height: number;
  material: number[];
  timer: number[];
  /** Absent in files saved before Step 14; parseScene normalizes a missing field to []. */
  windZones?: WindZone[];
}

export type SceneParseResult = { ok: true; scene: SceneData } | { ok: false; error: string };

/** Reads a grid's per-cell material+timer (plus any drawn wind zones) into a plain JSON-serializable snapshot. */
export function serializeScene(grid: Grid, windZones: readonly WindZone[] = []): SceneData {
  return {
    width: grid.width,
    height: grid.height,
    material: Array.from(grid.material),
    timer: Array.from(grid.timer),
    windZones: windZones.map((z) => ({ ...z })),
  };
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

/** Parses and validates a saved-scene JSON string against a target grid's dimensions. Pure — never touches a Grid. */
export function parseScene(json: string, width: number, height: number): SceneParseResult {
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

  if (data.width !== width || data.height !== height) {
    return {
      ok: false,
      error: `Could not load file: saved grid is ${data.width}x${data.height}, but the current grid is ${width}x${height}.`,
    };
  }

  const cellCount = width * height;
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
    if (!Array.isArray(zones) || zones.length > MAX_WIND_ZONES || !zones.every((z) => isValidWindZone(z, width, height))) {
      return { ok: false, error: "Could not load file: wind zone data is corrupted." };
    }
    windZones = zones.map((z: WindZone) => ({ gx: z.gx, gy: z.gy, gw: z.gw, gh: z.gh, strength: z.strength }));
  }

  return {
    ok: true,
    scene: { width: data.width, height: data.height, material: data.material, timer: data.timer, windZones },
  };
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
