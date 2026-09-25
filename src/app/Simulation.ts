import { AppState, type InteractionMode } from "./AppState";
import { createRng, deriveSeed, range, type Rng } from "../core/Rng";
import { ParticleKind, type FireworkPatternValue } from "../core/types";
import { Grid } from "../grid/Grid";
import { GridRenderer } from "../grid/GridRenderer";
import { GridStepper } from "../grid/GridStepper";
import { Material, MATERIALS, type MaterialIdValue } from "../grid/materials";
import { applyScene, parseScene, serializeScene } from "../grid/scene";
import type { Bounds } from "../particles/collisions";
import { launchRocket, updateFireworkBehaviors } from "../particles/fireworks";
import type { Particle } from "../particles/Particle";
import { renderParticles } from "../particles/ParticleRenderer";
import { ParticleSystem } from "../particles/ParticleSystem";
import { MAX_WIND_ZONES, normalizeZoneRect, WindField, ZONE_WIND_MAX, type WindZone } from "../wind/WindField";

const DEFAULT_GRAVITY = 1400; // px/s^2 — tuned for a snappy arcade feel at this canvas scale
const DEFAULT_DRAG_COEF = 0.8; // 1/s — applied to every click-spawned particle
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

/** Orchestrator: owns the particle engine (and, from Step 3 on, the material grid) behind a wall-clock-agnostic tick(dt)/render(ctx) pair. */
export class Simulation {
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly particles: ParticleSystem;
  readonly grid: Grid;

  private readonly particleRng: Rng;
  private readonly gridRng: Rng;
  private readonly gridStepper = new GridStepper();
  private readonly gridRenderer: GridRenderer;
  private readonly appState = new AppState();
  private readonly bounds: Bounds;
  private readonly gravity: number;
  private paused = false;
  private hoverPoint: { x: number; y: number } | null = null;
  private readonly windField: WindField;
  private zones: WindZone[] = [];
  /** The in-progress wind-zone drag (canvas pixels), drawn as a dashed preview until pointerup. */
  private zoneDraft: { x0: number; y0: number; x1: number; y1: number } | null = null;
  // One-line lever for Step 8 (or earlier) to run the CA slower than particle
  // physics; at 1 the grid steps every tick, same as particles.
  private readonly gridTicksPerSimTick = 1;
  private gridTickCounter = 0;

  constructor(opts: SimulationOptions) {
    this.width = opts.width;
    this.height = opts.height;
    this.bounds = { width: this.width, height: this.height };
    this.gravity = opts.gravity ?? DEFAULT_GRAVITY;
    this.cellSize = opts.cellSize ?? DEFAULT_CELL_SIZE;
    const seed = opts.seed ?? 1;
    this.particleRng = createRng(deriveSeed(seed, 1));
    this.gridRng = createRng(deriveSeed(seed, 2));
    this.particles = new ParticleSystem(opts.particleCapacity ?? 4000);
    const gridWidth = Math.max(1, Math.floor(this.width / this.cellSize));
    const gridHeight = Math.max(1, Math.floor(this.height / this.cellSize));
    this.grid = new Grid(gridWidth, gridHeight);
    this.gridRenderer = new GridRenderer(this.grid);
    this.windField = new WindField(gridWidth, gridHeight, this.cellSize);
  }

  spawnParticlesAt(x: number, y: number, count = 1): void {
    for (let i = 0; i < count; i++) {
      const angle = range(this.particleRng, 0, Math.PI * 2);
      const speed = range(this.particleRng, 10, 60);
      this.particles.spawn({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: range(this.particleRng, 1.5, 3.5),
        lifespan: range(this.particleRng, 1, 2),
        dragCoef: DEFAULT_DRAG_COEF,
      });
    }
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

  /** Paints (or erases, if the selected material is EMPTY) a square brush centered on a canvas pixel position. */
  paintAt(x: number, y: number): void {
    const gx = Math.floor(x / this.cellSize);
    const gy = Math.floor(y / this.cellSize);
    const material = this.appState.selectedMaterial;
    this.grid.forEachInSquare(gx, gy, this.appState.brushSize, (cx, cy) => this.grid.setMaterial(cx, cy, material));
  }

  /**
   * Paints along the segment between two canvas pixel positions, at sub-cell
   * steps — otherwise a fast drag would leave gaps between one pointermove
   * event's brush stamp and the next.
   */
  paintStroke(x0: number, y0: number, x1: number, y1: number): void {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / (this.cellSize / 2)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.paintAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
    }
  }

  clearGrid(): void {
    this.grid.clear();
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
    const zone = normalizeZoneRect(x0, y0, x1, y1, this.cellSize, this.grid.width, this.grid.height, this.appState.zoneStrength);
    if (!zone) return false;
    this.zones.push(zone);
    this.windField.rebuild(this.zones);
    return true;
  }

  /** Removes every wind zone — independent of clearGrid, which leaves zones in place. */
  clearWindZones(): void {
    this.zones = [];
    this.windField.rebuild(this.zones);
  }

  setZoneDraft(x0: number, y0: number, x1: number, y1: number): void {
    this.zoneDraft = { x0, y0, x1, y1 };
  }

  clearZoneDraft(): void {
    this.zoneDraft = null;
  }

  /** Serializes the grid's material+timer state and the wind zones to a JSON string. */
  exportScene(): string {
    return JSON.stringify(serializeScene(this.grid, this.zones));
  }

  /** Validates and loads a saved scene; returns null on success, or an error message on failure (grid and zones are left untouched on failure). A file with no zones clears the current ones — a load replaces the whole scene. */
  loadScene(json: string): string | null {
    const result = parseScene(json, this.grid.width, this.grid.height);
    if (!result.ok) return result.error;
    applyScene(this.grid, result.scene);
    this.zones = result.scene.windZones ?? [];
    this.windField.rebuild(this.zones);
    return null;
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
    launchRocket(this.particles, x0, y0, speed, this.appState.fireworkPattern);
  }

  tick(dt: number): void {
    if (this.paused) return;
    this.particles.update(dt, {
      gravity: this.gravity,
      wind: this.appState.wind,
      windField: this.windField,
      bounds: this.bounds,
    });
    updateFireworkBehaviors(this.particles, dt, this.particleRng);
    this.igniteEmbersOnLanding();
    this.gridTickCounter++;
    if (this.gridTickCounter % this.gridTicksPerSimTick === 0) {
      this.gridStepper.step(this.grid, this.gridRng, this.windField.values, this.appState.wind);
    }
  }

  /** A falling ember that reaches a non-empty grid cell is consumed — igniting the cell if it's flammable, just settling into it otherwise. */
  private igniteEmbersOnLanding(): void {
    const landed: Particle[] = [];
    this.particles.forEachActive((p) => {
      if (p.kind !== ParticleKind.EMBER) return;
      const gx = Math.floor(p.x / this.cellSize);
      const gy = Math.floor(p.y / this.cellSize);
      if (!this.grid.inBounds(gx, gy)) return;
      const cellId = this.grid.get(gx, gy);
      if (cellId === Material.EMPTY) return;
      if (MATERIALS[cellId].flammable) this.grid.transformMaterial(gx, gy, Material.FIRE, 0);
      landed.push(p);
    });
    for (const p of landed) this.particles.release(p);
  }

  /** Read-only snapshot for the on-screen readout — FPS is deliberately not here, since tick(dt) never reads the wall clock by design. */
  getStats(): { particleCount: number; activeCellCount: number; brushSize: number } {
    return {
      particleCount: this.particles.activeCount,
      activeCellCount: this.grid.activeCount,
      brushSize: this.appState.brushSize,
    };
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, this.width, this.height);
    this.gridRenderer.render(ctx, this.width, this.height);
    this.renderWindZones(ctx);
    renderParticles(ctx, this.particles);
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
    const zone = normalizeZoneRect(d.x0, d.y0, d.x1, d.y1, this.cellSize, this.grid.width, this.grid.height, 1);
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
    const gx = Math.floor(point.x / this.cellSize);
    const gy = Math.floor(point.y / this.cellSize);
    const size = this.appState.brushSize;
    const side = (2 * size + 1) * this.cellSize;
    const left = (gx - size) * this.cellSize;
    const top = (gy - size) * this.cellSize;
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
