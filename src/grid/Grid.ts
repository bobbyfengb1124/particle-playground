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

  /** Exchanges two cells' material+timer in place (e.g. a denser liquid sinking through a lighter one). */
  swapMaterial(aX: number, aY: number, bX: number, bY: number): void {
    const aIdx = this.index(aX, aY);
    const bIdx = this.index(bX, bY);
    const aMaterial = this.material[aIdx];
    const aTimer = this.timer[aIdx];
    this.material[aIdx] = this.material[bIdx];
    this.timer[aIdx] = this.timer[bIdx];
    this.material[bIdx] = aMaterial;
    this.timer[bIdx] = aTimer;
    this.processedThisTick[aIdx] = 1;
    this.processedThisTick[bIdx] = 1;
    this.markActiveAround(aX, aY);
    this.markActiveAround(bX, bY);
  }

  /**
   * Converts a cell to a different material in place (e.g. wood catching
   * fire, fire burning out to empty, water turned to steam, steam
   * condensing back to water) — same processed/active bookkeeping as
   * moveMaterial/swapMaterial, so a cell transformed mid-tick doesn't also
   * run its new rule this same tick.
   */
  transformMaterial(x: number, y: number, id: number, timer = 0): void {
    const idx = this.index(x, y);
    this.material[idx] = id;
    this.timer[idx] = timer;
    this.processedThisTick[idx] = 1;
    this.markActiveAround(x, y);
  }

  /**
   * Resets a cell's timer without changing its material or marking it
   * processed (unlike transformMaterial) — used to refresh an aging clock
   * in place, e.g. fire keeping nearby steam from condensing back to water
   * while still in contact. Not marking it processed matters here: fire is
   * always scanned before a cell directly above it in the same tick, so if
   * this did lock the cell, steam sitting right on top of a fire could
   * never take its own turn to drift away — it'd be "refreshed" every tick
   * before it ever got to move.
   */
  resetTimer(x: number, y: number): void {
    this.timer[this.index(x, y)] = 0;
  }

  /** Advances a cell's timer by one tick (a rule's own aging clock — burn/dissipation countdowns) and returns the new value. */
  incrementTimer(x: number, y: number): number {
    const idx = this.index(x, y);
    const next = this.timer[idx] + 1;
    this.timer[idx] = next;
    this.activeNext.add(idx);
    return next;
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
