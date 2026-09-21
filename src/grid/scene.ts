import type { Grid } from "./Grid";
import { MATERIALS } from "./materials";

export interface SceneData {
  width: number;
  height: number;
  material: number[];
  timer: number[];
}

export type SceneParseResult = { ok: true; scene: SceneData } | { ok: false; error: string };

/** Reads a grid's per-cell material+timer into a plain JSON-serializable snapshot. */
export function serializeScene(grid: Grid): SceneData {
  return {
    width: grid.width,
    height: grid.height,
    material: Array.from(grid.material),
    timer: Array.from(grid.timer),
  };
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

  return { ok: true, scene: { width: data.width, height: data.height, material: data.material, timer: data.timer } };
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
