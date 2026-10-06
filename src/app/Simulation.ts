import { AppState, type InteractionMode } from "./AppState";
import { CpuBackend } from "../backend/cpu/CpuBackend";
import type { SimBackend } from "../backend/SimBackend";
import type { FireworkColorValue, FireworkPatternValue } from "../core/types";
import type { Grid } from "../grid/Grid";
import type { MaterialIdValue } from "../grid/materials";
import { parseScene, REFERENCE_CELL_SIZE } from "../grid/scene";
import type { ParticleSystem } from "../particles/ParticleSystem";
import { MAX_WIND_ZONES, normalizeZoneRect, ZONE_WIND_MAX, type WindZone } from "../wind/WindField";

const DEFAULT_GRAVITY = 1400; // px/s^2 — tuned for a snappy arcade feel at this canvas scale
const DEFAULT_CELL_SIZE = 4; // px per grid cell
export const MAX_BRUSH_SIZE = 8; // cells — shared clamp for the slider, scroll-wheel, and pinch input paths

// A rocket always launches straight up; only how far the user dragged before
// releasing matters, mapped onto this fraction-of-canvas-height range so it
// scales with any Simulation size rather than a fixed pixel count.
const MIN_LAUNCH_HEIGHT_FRACTION = 0.15;
const MAX_LAUNCH_HEIGHT_FRACTION = 0.9;
const FULL_POWER_DRAG_FRACTION = 0.5; // dragging this fraction of the canvas height reaches max power

export interface SimulationOptions {
  width: number;
  height: number;
  seed?: number;
  particleCapacity?: number;
  gravity?: number;
  cellSize?: number;
}

/** Orchestrator: owns the UI state (AppState, wind zones, hover/draft overlays) and drives a SimBackend behind a wall-clock-agnostic tick(dt)/render(ctx) pair. */
export class Simulation {
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly backend: SimBackend;

  private readonly appState = new AppState();
  private readonly gravity: number;
  private paused = false;
  private hoverPoint: { x: number; y: number } | null = null;
  /** Drives the glow flicker. Counts unpaused ticks (not frames) so a paused scene is a still image; never feeds back into sim state. */
  private lightTickCount = 0;
  private zones: WindZone[] = [];
  /** The in-progress wind-zone drag (canvas pixels), drawn as a dashed preview until pointerup. */
  private zoneDraft: { x0: number; y0: number; x1: number; y1: number } | null = null;

  constructor(opts: SimulationOptions) {
    this.width = opts.width;
    this.height = opts.height;
    this.gravity = opts.gravity ?? DEFAULT_GRAVITY;
    this.backend = new CpuBackend({
      width: this.width,
      height: this.height,
      cellSize: opts.cellSize ?? DEFAULT_CELL_SIZE,
      seed: opts.seed ?? 1,
      particleCapacity: opts.particleCapacity ?? 4000,
      gravity: this.gravity,
    });
    this.cellSize = this.backend.cellSize;
  }

  /** The CPU backend's grid — for tests and debugging; there's no CPU-side grid on other backends. */
  get grid(): Grid {
    return this.cpuBackend().grid;
  }

  /** The CPU backend's particle pool — same caveat as `grid`. */
  get particles(): ParticleSystem {
    return this.cpuBackend().particles;
  }

  private cpuBackend(): CpuBackend {
    if (!(this.backend instanceof CpuBackend)) throw new Error(`grid/particles are only reachable on the CPU backend (this is "${this.backend.kind}")`);
    return this.backend;
  }

  spawnParticlesAt(x: number, y: number, count = 1): void {
    this.backend.spawnParticlesAt(x, y, count);
  }

  get wind(): number {
    return this.appState.wind;
  }

  setWind(wind: number): void {
    this.appState.wind = wind;
  }

  get selectedMaterial(): MaterialIdValue {
    return this.appState.selectedMaterial;
  }

  setSelectedMaterial(material: MaterialIdValue): void {
    this.appState.selectedMaterial = material;
  }

  get brushSize(): number {
    return this.appState.brushSize;
  }

  setBrushSize(size: number): void {
    this.appState.brushSize = Math.min(MAX_BRUSH_SIZE, Math.max(0, Math.floor(size)));
  }

  /** Steps the brush size by a whole number of cells (a wheel tick or a pinch threshold crossed), clamped the same as setBrushSize. A no-op outside paint mode, since brush size is meaningless while launching fireworks. */
  adjustBrushSize(delta: number): void {
    if (this.appState.mode !== "paint") return;
    this.setBrushSize(this.appState.brushSize + delta);
  }

  /** Records the last hovered/dragged canvas pixel position, used to draw the brush-footprint outline in paint mode. */
  setHoverPoint(x: number, y: number): void {
    this.hoverPoint = { x, y };
  }

  /** Clears the hover position (e.g. the pointer left the canvas) so the outline stops drawing. */
  clearHoverPoint(): void {
    this.hoverPoint = null;
  }

  /** Paints (or erases, if the selected material is EMPTY) a square brush centered on a canvas pixel position, snapped to the REFERENCE_CELL_SIZE brush lattice. */
  paintAt(x: number, y: number): void {
    const bx = Math.floor(x / REFERENCE_CELL_SIZE);
    const by = Math.floor(y / REFERENCE_CELL_SIZE);
    this.backend.paintBrush(bx, by, this.appState.brushSize, this.appState.selectedMaterial);
  }

  /**
   * Paints along the segment between two canvas pixel positions, at sub-cell
   * steps — otherwise a fast drag would leave gaps between one pointermove
   * event's brush stamp and the next.
   */
  paintStroke(x0: number, y0: number, x1: number, y1: number): void {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / (REFERENCE_CELL_SIZE / 2)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.paintAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    }
  }

  clearGrid(): void {
    this.backend.clearGrid();
  }

  get windZones(): readonly WindZone[] {
    return this.zones;
  }

  get zoneStrength(): number {
    return this.appState.zoneStrength;
  }

  setZoneStrength(strength: number): void {
    this.appState.zoneStrength = Math.min(ZONE_WIND_MAX, Math.max(-ZONE_WIND_MAX, strength));
  }

  /** Turns a finished drag into a zone at the current strength; returns false when ignored (cap reached, a plain click, or zero strength). */
  addWindZoneFromDrag(x0: number, y0: number, x1: number, y1: number): boolean {
    if (this.zones.length >= MAX_WIND_ZONES) return false;
    const zone = normalizeZoneRect(x0, y0, x1, y1, this.cellSize, this.backend.gridWidth, this.backend.gridHeight, this.appState.zoneStrength);
    if (!zone) return false;
    this.zones.push(zone);
    this.backend.setWindZones(this.zones);
    return true;
  }

  /** Removes every wind zone — independent of clearGrid, which leaves zones in place. */
  clearWindZones(): void {
    this.zones = [];
    this.backend.setWindZones(this.zones);
  }

  setZoneDraft(x0: number, y0: number, x1: number, y1: number): void {
    this.zoneDraft = { x0, y0, x1, y1 };
  }

  clearZoneDraft(): void {
    this.zoneDraft = null;
  }

  /** Serializes the grid's material+timer state and the wind zones to a JSON string. Async because a GPU backend reads its cells back from the device. */
  async exportScene(): Promise<string> {
    const cells = await this.backend.exportCells();
    return JSON.stringify({ ...cells, windZones: this.zones.map((z) => ({ ...z })) });
  }

  /** Validates and loads a saved scene; returns null on success, or an error message on failure (grid and zones are left untouched on failure). A file with no zones clears the current ones — a load replaces the whole scene. */
  loadScene(json: string): string | null {
    const result = parseScene(json, this.backend.gridWidth, this.backend.gridHeight, this.cellSize);
    if (!result.ok) return result.error;
    this.backend.applyScene(result.scene);
    this.zones = result.scene.windZones ?? [];
    this.backend.setWindZones(this.zones);
    return null;
  }

  get lightingEnabled(): boolean {
    return this.appState.lightingEnabled;
  }

  setLightingEnabled(on: boolean): void {
    this.appState.lightingEnabled = on;
  }

  get lightTick(): number {
    return this.lightTickCount;
  }

  get mode(): InteractionMode {
    return this.appState.mode;
  }

  setMode(mode: InteractionMode): void {
    this.appState.mode = mode;
  }

  get fireworkPattern(): FireworkPatternValue {
    return this.appState.fireworkPattern;
  }

  setFireworkPattern(pattern: FireworkPatternValue): void {
    this.appState.fireworkPattern = pattern;
  }

  get fireworkColor(): FireworkColorValue {
    return this.appState.fireworkColor;
  }

  setFireworkColor(color: FireworkColorValue): void {
    this.appState.fireworkColor = color;
  }

  /**
   * Launches a rocket straight up from (x0, y0); the drag distance to
   * (x1, y1) sets how high it flies before bursting — direction is ignored,
   * only distance matters, clamped at FULL_POWER_DRAG_FRACTION of the canvas
   * height so a click with no drag still fires a low burst.
   */
  launchFromDrag(x0: number, y0: number, x1: number, y1: number): void {
    const dragDistance = Math.hypot(x1 - x0, y1 - y0);
    const power = Math.min(1, dragDistance / (this.height * FULL_POWER_DRAG_FRACTION));
    const targetHeight = this.height * (MIN_LAUNCH_HEIGHT_FRACTION + power * (MAX_LAUNCH_HEIGHT_FRACTION - MIN_LAUNCH_HEIGHT_FRACTION));
    const speed = Math.sqrt(2 * this.gravity * targetHeight);
    this.backend.launchRocket(x0, y0, speed, this.appState.fireworkPattern, this.appState.fireworkColor);
  }

  tick(dt: number): void {
    if (this.paused) return;
    this.lightTickCount++;
    this.backend.tick(dt, this.appState.wind);
  }

  /** Read-only snapshot for the on-screen readout — FPS is deliberately not here, since tick(dt) never reads the wall clock by design. */
  getStats(): { particleCount: number; activeCellCount: number; brushSize: number } {
    return { ...this.backend.getStats(), brushSize: this.appState.brushSize };
  }

  render(ctx: CanvasRenderingContext2D): void {
    this.backend.renderScene(ctx, this.appState.lightingEnabled, this.lightTickCount);
    this.renderWindZones(ctx);
    if (this.appState.mode === "paint" && this.hoverPoint) this.renderBrushOutline(ctx, this.hoverPoint);
    if (this.appState.mode === "wind-zone" && this.zoneDraft) this.renderZoneDraft(ctx, this.zoneDraft);
  }

  /** Faint cyan fill (stronger zones are more opaque), a 1px outline, and a row of ›/‹ chevrons pointing downwind. */
  private renderWindZones(ctx: CanvasRenderingContext2D): void {
    if (this.zones.length === 0) return;
    ctx.save();
    ctx.lineWidth = 1;
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const z of this.zones) {
      const left = z.gx * this.cellSize;
      const top = z.gy * this.cellSize;
      const w = z.gw * this.cellSize;
      const h = z.gh * this.cellSize;
      const alpha = 0.05 + 0.15 * (Math.abs(z.strength) / ZONE_WIND_MAX);
      ctx.fillStyle = `rgba(80, 220, 255, ${alpha})`;
      ctx.fillRect(left, top, w, h);
      ctx.strokeStyle = "rgba(80, 220, 255, 0.5)";
      ctx.strokeRect(left + 0.5, top + 0.5, w - 1, h - 1);
      if (w >= 12 && h >= 12) {
        ctx.fillStyle = "rgba(80, 220, 255, 0.6)";
        const glyph = z.strength > 0 ? "›" : "‹";
        const count = Math.max(1, Math.min(8, Math.floor(w / 24)));
        for (let i = 0; i < count; i++) ctx.fillText(glyph, left + ((i + 0.5) * w) / count, top + h / 2);
      }
    }
    ctx.restore();
  }

  /** Dashed preview of the zone being dragged, snapped to the same cells the finished zone will cover. */
  private renderZoneDraft(ctx: CanvasRenderingContext2D, d: { x0: number; y0: number; x1: number; y1: number }): void {
    const zone = normalizeZoneRect(d.x0, d.y0, d.x1, d.y1, this.cellSize, this.backend.gridWidth, this.backend.gridHeight, 1);
    if (!zone) return;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 1;
    ctx.strokeRect(zone.gx * this.cellSize + 0.5, zone.gy * this.cellSize + 0.5, zone.gw * this.cellSize - 1, zone.gh * this.cellSize - 1);
    ctx.restore();
  }

  /** Outlines the brush's actual square footprint (not a circle — the brush itself is square) centered on the hovered cell. */
  private renderBrushOutline(ctx: CanvasRenderingContext2D, point: { x: number; y: number }): void {
    const bx = Math.floor(point.x / REFERENCE_CELL_SIZE);
    const by = Math.floor(point.y / REFERENCE_CELL_SIZE);
    const size = this.appState.brushSize;
    const side = (2 * size + 1) * REFERENCE_CELL_SIZE;
    const left = (bx - size) * REFERENCE_CELL_SIZE;
    const top = (by - size) * REFERENCE_CELL_SIZE;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 1;
    ctx.strokeRect(left + 0.5, top + 0.5, side - 1, side - 1);
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  get isPaused(): boolean {
    return this.paused;
  }
}
