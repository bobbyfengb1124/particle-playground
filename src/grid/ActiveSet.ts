/**
 * Uint8Array-backed sparse set of cell indices. Deterministic insertion-order
 * iteration (unlike Set<number>'s hash-map internals) matters for snapshot
 * test reproducibility, and add/has/clear are all O(1).
 */
export class ActiveSet {
  private readonly inSet: Uint8Array;
  private readonly indices: Uint32Array;
  private count = 0;

  constructor(capacity: number) {
    this.inSet = new Uint8Array(capacity);
    this.indices = new Uint32Array(capacity);
  }

  add(index: number): void {
    if (this.inSet[index]) return;
    this.inSet[index] = 1;
    this.indices[this.count++] = index;
  }

  has(index: number): boolean {
    return this.inSet[index] === 1;
  }

  clear(): void {
    for (let i = 0; i < this.count; i++) this.inSet[this.indices[i]] = 0;
    this.count = 0;
  }

  get size(): number {
    return this.count;
  }
}
