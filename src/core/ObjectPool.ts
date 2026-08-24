export interface Poolable {
  poolSlot: number;
}

/**
 * Fixed-capacity pool of pre-allocated objects. Active items are tracked via
 * a dense slot list with swap-remove, so acquire/release/iterate are all O(1)
 * amortized and no per-item allocation happens after construction.
 */
export class ObjectPool<T extends Poolable> {
  readonly capacity: number;
  private readonly pool: T[];
  private readonly activeSlots: Uint32Array;
  private readonly positionOfSlot: Int32Array;
  private activeCount = 0;

  constructor(capacity: number, factory: () => T) {
    this.capacity = capacity;
    this.pool = Array.from({ length: capacity }, factory);
    this.activeSlots = new Uint32Array(capacity);
    this.positionOfSlot = new Int32Array(capacity).fill(-1);
    for (let slot = 0; slot < capacity; slot++) this.activeSlots[slot] = slot;
  }

  get size(): number {
    return this.activeCount;
  }

  acquire(): T | null {
    if (this.activeCount >= this.capacity) return null;
    const slot = this.activeSlots[this.activeCount];
    this.positionOfSlot[slot] = this.activeCount;
    this.activeCount++;
    const item = this.pool[slot];
    item.poolSlot = slot;
    return item;
  }

  release(item: T): void {
    const slot = item.poolSlot;
    const pos = this.positionOfSlot[slot];
    if (pos === -1) return;
    this.removeAtPosition(pos);
  }

  /** Removes every active item matching `predicate`, in a single O(activeCount) backward pass. */
  releaseIf(predicate: (item: T) => boolean): void {
    for (let pos = this.activeCount - 1; pos >= 0; pos--) {
      const item = this.pool[this.activeSlots[pos]];
      if (predicate(item)) this.removeAtPosition(pos);
    }
  }

  forEachActive(fn: (item: T) => void): void {
    for (let pos = 0; pos < this.activeCount; pos++) fn(this.pool[this.activeSlots[pos]]);
  }

  private removeAtPosition(pos: number): void {
    const lastPos = this.activeCount - 1;
    const deadSlot = this.activeSlots[pos];
    const lastSlot = this.activeSlots[lastPos];
    this.activeSlots[pos] = lastSlot;
    this.activeSlots[lastPos] = deadSlot;
    this.positionOfSlot[lastSlot] = pos;
    this.positionOfSlot[deadSlot] = -1;
    this.activeCount--;
  }
}
