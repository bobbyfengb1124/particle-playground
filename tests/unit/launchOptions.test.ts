import { describe, expect, it } from "vitest";
import { readLaunchOptions } from "../../src/app/launchOptions";

describe("readLaunchOptions", () => {
  it("defaults to CPU with no cell size", () => {
    expect(readLaunchOptions("")).toEqual({ backend: "cpu", cellSize: null });
  });

  it("selects the GPU only for an exact 'gpu'", () => {
    expect(readLaunchOptions("?backend=gpu").backend).toBe("gpu");
    expect(readLaunchOptions("?backend=GPU").backend).toBe("cpu");
    expect(readLaunchOptions("?backend=webgpu").backend).toBe("cpu");
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
