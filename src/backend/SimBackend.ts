import type { FireworkColorValue, FireworkPatternValue } from "../core/types";
import type { GpuMs } from "../gpu/GpuTimer";
import type { MaterialIdValue } from "../grid/materials";
import type { SceneData } from "../grid/scene";
import type { WindZone } from "../wind/WindField";

export type BackendKind = "cpu" | "gpu";

export interface BackendStats {
  particleCount: number;
  /** CPU: awake cells (the active set). GPU: non-empty cells, since it scans every cell and has no active set. */
  activeCellCount: number;
  /** GPU only: average ms per frame since the last call, or null without timestamp-query ("GPU: n/a"). Absent on CPU. */
  gpuMs?: GpuMs | null;
}

export interface BackendSoundEvents {
  /** Apex bursts since the last takeSoundEvents() (crossette splits not counted). */
  bursts: number;
  /** Burning area in px² (fire cells × cellSize²) as of the last count, ~250 ms old, so a fire sounds the same at every cell size. */
  fireArea: number;
}

/**
 * The grid + particle engine behind Simulation. Simulation keeps the UI state
 * (AppState, zones, hover/draft overlays) and talks to the engine only
 * through this seam, so the CPU and GPU engines are interchangeable.
 */
export interface SimBackend {
  readonly kind: BackendKind;
  readonly cellSize: number; // pixels per cell: 4 on CPU today, 1 on GPU later
  readonly gridWidth: number; // cells across
  readonly gridHeight: number; // cells down
  readonly tickScale: number; // grid steps per sim tick = 4 / cellSize

  tick(dt: number, globalWind: number): void;
  /** (bx, by) are on the fixed 4 px brush grid whatever cellSize is, so a stroke covers the same pixels on every backend. */
  paintBrush(bx: number, by: number, radius: number, material: MaterialIdValue): void;
  clearGrid(): void;
  spawnParticlesAt(x: number, y: number, count: number): void;
  /** False if the backend refused it (no free slot / over the request cap), so there's no whoosh (Step 18 Q13). */
  launchRocket(x: number, y: number, speed: number, pattern: FireworkPatternValue, color: FireworkColorValue, density: number): boolean;
  setWindZones(zones: readonly WindZone[]): void;
  /** Cells and particles only, drawn onto the backend's own #scene canvas; the UI overlays stay in Simulation. */
  renderScene(lighting: boolean, frame: number): void;
  getStats(): BackendStats;
  /** Sound events since the last call (Step 18 Q10): drains the burst count, so only one caller (the sound update) may use it. */
  takeSoundEvents(): BackendSoundEvents;
  /** Async because the GPU backend copies its cells back from the device. Wind zones aren't included. */
  exportCells(): Promise<SceneData>;
  /** Wind zones in `scene` are ignored; Simulation handles those. */
  applyScene(scene: SceneData): void;
}
