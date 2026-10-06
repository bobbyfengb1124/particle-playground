import { describe, expect, it } from "vitest";
import { Grid } from "../../src/grid/Grid";
import { Material } from "../../src/grid/materials";
import { applyScene, parseScene, resampleScene, serializeScene, type SceneData } from "../../src/grid/scene";

describe("serializeScene", () => {
  it("produces plain arrays with the grid's dimensions, materials, and timers", () => {
    const grid = new Grid(3, 2);
    grid.setMaterial(1, 0, Material.WOOD);
    grid.transformMaterial(1, 0, Material.FIRE, 5);

    const scene = serializeScene(grid);

    expect(scene.width).toBe(3);
    expect(scene.height).toBe(2);
    expect(Array.isArray(scene.material)).toBe(true);
    expect(Array.isArray(scene.timer)).toBe(true);
    expect(scene.material[grid.index(1, 0)]).toBe(Material.FIRE);
    expect(scene.timer[grid.index(1, 0)]).toBe(5);
  });
});

describe("scene round trip", () => {
  it("reproduces the original grid through a real JSON string boundary", () => {
    const original = new Grid(4, 4);
    original.setMaterial(0, 0, Material.SAND);
    original.setMaterial(1, 1, Material.WOOD);
    original.transformMaterial(1, 1, Material.FIRE, 12);
    original.setMaterial(2, 3, Material.WATER);

    const json = JSON.stringify(serializeScene(original));
    const result = parseScene(json, 4, 4);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const loaded = new Grid(4, 4);
    applyScene(loaded, result.scene);

    expect(Array.from(loaded.material)).toEqual(Array.from(original.material));
    expect(Array.from(loaded.timer)).toEqual(Array.from(original.timer));
  });

  it("marks loaded cells active so they aren't stuck frozen by the active-skip optimization", () => {
    const grid = new Grid(3, 3);
    const scene = {
      width: 3,
      height: 3,
      material: Array(9).fill(Material.EMPTY),
      timer: Array(9).fill(0),
    };
    scene.material[grid.index(1, 0)] = Material.SAND;

    applyScene(grid, scene);
    grid.beginTick(); // markActiveAround stages into activeNext; beginTick() swaps it in

    expect(grid.isActive(grid.index(1, 0))).toBe(true);
  });
});

describe("parseScene", () => {
  const width = 2;
  const height = 2;

  it("rejects malformed JSON", () => {
    const result = parseScene("not json", width, height);
    expect(result).toEqual({ ok: false, error: "Could not load file: not a valid JSON file." });
  });

  it("rejects missing/wrong-typed fields", () => {
    const result = parseScene(JSON.stringify({ width, height }), width, height);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Could not load file: not a recognized scene file.");
  });

  it("rejects a dimension mismatch and names both dimensions", () => {
    const scene = { width: 5, height: 6, material: Array(30).fill(0), timer: Array(30).fill(0) };
    const result = parseScene(JSON.stringify(scene), width, height);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("5x6");
    expect(result.error).toContain(`${width}x${height}`);
  });

  it("rejects a wrong array length", () => {
    const scene = { width, height, material: [0, 0, 0], timer: [0, 0, 0] };
    const result = parseScene(JSON.stringify(scene), width, height);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Could not load file: grid data is corrupted (wrong array length).");
  });

  it("rejects an out-of-range material id", () => {
    const scene = { width, height, material: [0, 0, 0, 999], timer: [0, 0, 0, 0] };
    const result = parseScene(JSON.stringify(scene), width, height);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Could not load file: grid data is corrupted (invalid material id).");
  });

  it("rejects an invalid timer value", () => {
    const scene = { width, height, material: [0, 0, 0, 0], timer: [0, 0, 0, -1] };
    const result = parseScene(JSON.stringify(scene), width, height);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("Could not load file: grid data is corrupted (invalid timer value).");
  });

  it("accepts a well-formed scene, normalizing missing windZones (pre-Step-14) to [] and missing cellSize (pre-Step-17) to 4", () => {
    const scene = { width, height, material: [0, 1, 2, 3], timer: [0, 0, 0, 5] };
    const result = parseScene(JSON.stringify(scene), width, height);
    expect(result).toEqual({ ok: true, scene: { ...scene, cellSize: 4, windZones: [] } });
  });

  it("accepts valid wind zones", () => {
    const windZones = [{ gx: 0, gy: 0, gw: 2, gh: 1, strength: -800 }];
    const scene = { width, height, material: [0, 0, 0, 0], timer: [0, 0, 0, 0], windZones };
    const result = parseScene(JSON.stringify(scene), width, height);
    expect(result).toEqual({ ok: true, scene: { ...scene, cellSize: 4 } });
  });

  it.each([
    ["not an array", { gx: 0 }],
    ["a non-integer coordinate", [{ gx: 0.5, gy: 0, gw: 1, gh: 1, strength: 100 }]],
    ["a zero-size zone", [{ gx: 0, gy: 0, gw: 0, gh: 1, strength: 100 }]],
    ["a zone past the grid edge", [{ gx: 1, gy: 0, gw: 2, gh: 1, strength: 100 }]],
    ["a strength beyond ±800", [{ gx: 0, gy: 0, gw: 1, gh: 1, strength: 900 }]],
    ["a non-numeric strength", [{ gx: 0, gy: 0, gw: 1, gh: 1, strength: "strong" }]],
    ["more than 32 zones", Array(33).fill({ gx: 0, gy: 0, gw: 1, gh: 1, strength: 100 })],
  ])("rejects wind zone data with %s", (_label, windZones) => {
    const scene = { width, height, material: [0, 0, 0, 0], timer: [0, 0, 0, 0], windZones };
    const result = parseScene(JSON.stringify(scene), width, height);
    expect(result).toEqual({ ok: false, error: "Could not load file: wind zone data is corrupted." });
  });
});

describe("serializeScene wind zones", () => {
  it("always writes a windZones array, round-tripping the zones it was given", () => {
    const grid = new Grid(4, 4);
    expect(serializeScene(grid).windZones).toEqual([]);

    const zones = [{ gx: 1, gy: 1, gw: 2, gh: 3, strength: 250 }];
    const result = parseScene(JSON.stringify(serializeScene(grid, zones)), 4, 4);
    expect(result.ok && result.scene.windZones).toEqual(zones);
  });
});

describe("scenes across cell sizes", () => {
  const { EMPTY, SAND, FIRE, SEED, STONE } = Material;

  /** A 2x2 coarse (4px) scene: sand, fire 100 ticks in, a stage-3 seed with 40 watered ticks, stone — plus one zone. */
  function coarseScene(): SceneData {
    return {
      width: 2,
      height: 2,
      cellSize: 4,
      material: [SAND, FIRE, SEED, STONE],
      timer: [0, 100, (3 << 8) | 40, 0],
      windZones: [{ gx: 1, gy: 0, gw: 1, gh: 2, strength: 300 }],
    };
  }

  it("going finer, each cell becomes a ratio×ratio block with timers scaled to the same point in life", () => {
    const fine = resampleScene(coarseScene(), 4, 1);
    expect(fine.width).toBe(8);
    expect(fine.height).toBe(8);
    expect(fine.cellSize).toBe(1);
    const at = (x: number, y: number): [number, number] => [fine.material[y * 8 + x], fine.timer[y * 8 + x]];
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        expect(at(x, y)).toEqual([SAND, 0]);
        expect(at(x + 4, y)).toEqual([FIRE, 400]); // 100 of 180 → 400 of 720
        expect(at(x, y + 4)).toEqual([SEED, (12 << 8) | 40]); // stage 3 of 6 → 12 of 24; watered ticks unchanged
        expect(at(x + 4, y + 4)).toEqual([STONE, 0]);
      }
    }
    expect(fine.windZones).toEqual([{ gx: 4, gy: 0, gw: 4, gh: 8, strength: 300 }]);
  });

  it("going coarser, each block keeps its top-left cell, timers floored", () => {
    const fine: SceneData = {
      width: 4,
      height: 2,
      cellSize: 2,
      material: [FIRE, SAND, EMPTY, SEED, SAND, SAND, SAND, SAND],
      timer: [101, 0, 0, (13 << 8) | 7, 0, 0, 0, 0],
      windZones: [{ gx: 1, gy: 0, gw: 2, gh: 1, strength: -50 }],
    };
    const coarse = resampleScene(fine, 2, 4);
    expect(coarse.width).toBe(2);
    expect(coarse.height).toBe(1);
    expect(coarse.material).toEqual([FIRE, EMPTY]); // top-left of each 2x2 block
    expect(coarse.timer).toEqual([50, 0]); // 101 / 2, floored
    // Pixels 2..5 → coarse cells 0..1: rounded outward so the zone can't vanish.
    expect(coarse.windZones).toEqual([{ gx: 0, gy: 0, gw: 2, gh: 1, strength: -50 }]);
  });

  it("scales a seed's stage down with the height cap, keeping its watered ticks", () => {
    const fine: SceneData = { width: 2, height: 2, cellSize: 2, material: [SEED, 0, 0, 0], timer: [(13 << 8) | 7, 0, 0, 0] };
    expect(resampleScene(fine, 2, 4).timer).toEqual([(6 << 8) | 7]);
  });

  it("round-trips coarse → fine → coarse exactly", () => {
    const original = coarseScene();
    const back = resampleScene(resampleScene(original, 4, 1), 1, 4);
    expect(back).toEqual(original);
  });

  it("parseScene loads a pre-Step-17 file (no cellSize) into a finer grid by pixel size", () => {
    const { cellSize: _omitted, ...oldFile } = coarseScene();
    const result = parseScene(JSON.stringify(oldFile), 8, 8, 1);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scene).toEqual(resampleScene(coarseScene(), 4, 1));
  });

  it("parseScene rejects a file covering a different pixel size, with the existing message", () => {
    const result = parseScene(JSON.stringify(coarseScene()), 4, 4, 1); // 8x8 px file vs a 4x4 px grid
    expect(result).toEqual({ ok: false, error: "Could not load file: saved grid is 2x2, but the current grid is 4x4." });
  });

  it("parseScene rejects an unsupported cell size as corrupted", () => {
    const result = parseScene(JSON.stringify({ ...coarseScene(), cellSize: 3 }), 2, 2, 4);
    expect(result).toEqual({ ok: false, error: "Could not load file: grid data is corrupted (invalid cell size)." });
  });
});
