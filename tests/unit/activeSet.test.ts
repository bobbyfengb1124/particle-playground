import { describe, expect, it } from "vitest";
import { ActiveSet } from "../../src/grid/ActiveSet";

describe("ActiveSet", () => {
  it("tracks added indices and reports them as active", () => {
    const set = new ActiveSet(10);
    set.add(3);
    set.add(7);
    expect(set.has(3)).toBe(true);
    expect(set.has(7)).toBe(true);
    expect(set.has(4)).toBe(false);
    expect(set.size).toBe(2);
  });

  it("adding the same index twice does not grow size", () => {
    const set = new ActiveSet(10);
    set.add(5);
    set.add(5);
    expect(set.size).toBe(1);
  });

  it("clear() empties the set", () => {
    const set = new ActiveSet(10);
    set.add(1);
    set.add(2);
    set.clear();
    expect(set.size).toBe(0);
    expect(set.has(1)).toBe(false);
    expect(set.has(2)).toBe(false);
  });
});
