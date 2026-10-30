import { describe, expect, it } from "vitest";
import { readLaunchOptions } from "../../src/app/launchOptions";

describe("readLaunchOptions", () => {
  it("defaults to auto with no cell size", () => {
    expect(readLaunchOptions("")).toEqual({ backend: "auto", cellSize: null });
  });

  it("forces a backend only for an exact 'cpu' or 'gpu'", () => {
    expect(readLaunchOptions("?backend=gpu").backend).toBe("gpu");
    expect(readLaunchOptions("?backend=cpu").backend).toBe("cpu");
  });

  it("treats an unknown backend like no param", () => {
    for (const typo of ["?backend=GPU", "?backend=webgpu", "?backend="]) {
      expect(readLaunchOptions(typo).backend).toBe("auto");
    }
  });

  it("accepts cell sizes 1, 2 and 4, and ignores anything else", () => {
    expect(readLaunchOptions("?cell=1").cellSize).toBe(1);
    expect(readLaunchOptions("?cell=2").cellSize).toBe(2);
    expect(readLaunchOptions("?cell=4").cellSize).toBe(4);
    for (const bad of ["?cell=3", "?cell=0", "?cell=abc", "?cell="]) {
      expect(readLaunchOptions(bad).cellSize).toBeNull();
    }
  });
});
