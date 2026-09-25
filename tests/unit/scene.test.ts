import { describe, expect, it } from "vitest";
import { Grid } from "../../src/grid/Grid";
import { Material } from "../../src/grid/materials";
import { applyScene, parseScene, serializeScene } from "../../src/grid/scene";

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

  it("accepts a well-formed scene, normalizing a missing windZones field (a pre-Step-14 file) to []", () => {
    const scene = { width, height, material: [0, 1, 2, 3], timer: [0, 0, 0, 5] };
    const result = parseScene(JSON.stringify(scene), width, height);
    expect(result).toEqual({ ok: true, scene: { ...scene, windZones: [] } });
  });

  it("accepts valid wind zones", () => {
    const windZones = [{ gx: 0, gy: 0, gw: 2, gh: 1, strength: -800 }];
    const scene = { width, height, material: [0, 0, 0, 0], timer: [0, 0, 0, 0], windZones };
    const result = parseScene(JSON.stringify(scene), width, height);
    expect(result).toEqual({ ok: true, scene });
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
