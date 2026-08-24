import { ActiveSet } from "./ActiveSet";
import { Material } from "./materials";

/**
 * Dense typed-array grid. Reads (`material`/`timer`) are public for fast
 * direct access by GridStepper/GridRenderer; writes must go through
 * `setMaterial`/`moveMaterial` so the processed/active bookkeeping stays
 * consistent.
 */
export class Grid {
  readonly width: number;
  readonly height: number;
  readonly material: Uint8Array;
  readonly timer: Uint16Array;

  private readonly processedThisTick: Uint8Array;
  // Double-buffered: `activeCurrent` is what this tick's scan checks against;
  // `activeNext` accumulates cells touched during this tick, becoming the
  // "current" set for the following tick via the swap in beginTick(). A cell
  // that stops changing simply isn't re-added, and falls out on its own.
  private activeCurrent: ActiveSet;
  private activeNext: ActiveSet;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const cellCount = width * height;
    this.material = new Uint8Array(cellCount);
    this.timer = new Uint16Array(cellCount);
    this.processedThisTick = new Uint8Array(cellCount);
    this.activeCurrent = new ActiveSet(cellCount);
    this.activeNext = new ActiveSet(cellCount);
  }

  index(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  get(x: number, y: number): number {
    return this.material[this.index(x, y)];
  }

  /** Directly sets a cell's material (painting/seeding) — not a move. */
  setMaterial(x: number, y: number, id: number): void {
    const idx = this.index(x, y);
    this.material[idx] = id;
    this.timer[idx] = 0;
    this.markActiveAround(x, y);
  }

  /** Moves a cell's material+timer onto an empty destination, clearing the source. */
  moveMaterial(fromX: number, fromY: number, toX: number, toY: number): void {
    const fromIdx = this.index(fromX, fromY);
    const toIdx = this.index(toX, toY);
    this.material[toIdx] = this.material[fromIdx];
    this.timer[toIdx] = this.timer[fromIdx];
    this.material[fromIdx] = Material.EMPTY;
    this.timer[fromIdx] = 0;
    this.processedThisTick[toIdx] = 1;
    this.markActiveAround(fromX, fromY);
    this.markActiveAround(toX, toY);
  }

  isProcessed(idx: number): boolean {
    return this.processedThisTick[idx] === 1;
  }

  isActive(idx: number): boolean {
    return this.activeCurrent.has(idx);
  }

  get activeCount(): number {
    return this.activeCurrent.size;
  }

  /** Called once at the start of each GridStepper tick. */
  beginTick(): void {
    this.processedThisTick.fill(0);
    const settled = this.activeCurrent;
    this.activeCurrent = this.activeNext;
    settled.clear();
    this.activeNext = settled;
  }

  markActiveAround(x: number, y: number): void {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (this.inBounds(nx, ny)) this.activeNext.add(this.index(nx, ny));
      }
    }
  }

  clear(): void {
    this.material.fill(Material.EMPTY);
    this.timer.fill(0);
    this.activeCurrent.clear();
    this.activeNext.clear();
  }
}
