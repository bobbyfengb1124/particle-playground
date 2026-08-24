import { describe, expect, it } from "vitest";
import { ObjectPool } from "../../src/core/ObjectPool";

class Slot {
  poolSlot = -1;
  tag = 0;
}

describe("ObjectPool", () => {
  it("acquires up to capacity, then refuses further spawns", () => {
    const pool = new ObjectPool<Slot>(2, () => new Slot());
    expect(pool.acquire()).not.toBeNull();
    expect(pool.acquire()).not.toBeNull();
    expect(pool.acquire()).toBeNull();
    expect(pool.size).toBe(2);
  });

  it("reuses a released slot's underlying object", () => {
    const pool = new ObjectPool<Slot>(1, () => new Slot());
    const a = pool.acquire();
    expect(a).not.toBeNull();
    a!.tag = 42;
    pool.release(a!);
    expect(pool.size).toBe(0);
    const b = pool.acquire();
    expect(b).toBe(a);
  });

  it("forEachActive visits only currently active items", () => {
    const pool = new ObjectPool<Slot>(3, () => new Slot());
    const a = pool.acquire()!;
    const b = pool.acquire()!;
    pool.release(a);
    const seen: Slot[] = [];
    pool.forEachActive((item) => seen.push(item));
    expect(seen).toEqual([b]);
  });

  it("releaseIf removes every matching item in one pass regardless of position", () => {
    const pool = new ObjectPool<Slot>(5, () => new Slot());
    const items = Array.from({ length: 5 }, () => pool.acquire()!);
    items[1].tag = 1;
    items[3].tag = 1;
    pool.releaseIf((item) => item.tag === 1);
    expect(pool.size).toBe(3);
    const seen = new Set<Slot>();
    pool.forEachActive((item) => seen.add(item));
    expect(seen.has(items[1])).toBe(false);
    expect(seen.has(items[3])).toBe(false);
    expect(seen.size).toBe(3);
  });

  it("ignores a double release instead of corrupting pool state", () => {
    const pool = new ObjectPool<Slot>(2, () => new Slot());
    const a = pool.acquire()!;
    pool.release(a);
    pool.release(a);
    expect(pool.size).toBe(0);
    expect(pool.acquire()).not.toBeNull();
    expect(pool.acquire()).not.toBeNull();
  });
});
