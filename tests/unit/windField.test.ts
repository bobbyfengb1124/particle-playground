import { describe, expect, it } from "vitest";
import { normalizeZoneRect, WindField, ZONE_WIND_MAX } from "../../src/wind/WindField";

describe("WindField", () => {
  it("rebuild fills exactly the cells a zone covers and leaves every other cell at 0", () => {
    const field = new WindField(6, 4, 4);
    field.rebuild([{ gx: 1, gy: 1, gw: 3, gh: 2, strength: 300 }]);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 6; x++) {
        const inside = x >= 1 && x <= 3 && y >= 1 && y <= 2;
        expect(field.atCell(y * 6 + x)).toBe(inside ? 300 : 0);
      }
    }
  });

  it("sums overlapping zones, so opposite zones cancel out", () => {
    const field = new WindField(4, 1, 4);
    field.rebuild([
      { gx: 0, gy: 0, gw: 3, gh: 1, strength: 300 },
      { gx: 1, gy: 0, gw: 3, gh: 1, strength: -300 },
    ]);
    expect(Array.from(field.values)).toEqual([300, 0, 0, -300]);
  });

  it("clamps the summed value to ±ZONE_WIND_MAX", () => {
    const field = new WindField(2, 1, 4);
    field.rebuild([
      { gx: 0, gy: 0, gw: 1, gh: 1, strength: 600 },
      { gx: 0, gy: 0, gw: 1, gh: 1, strength: 600 },
      { gx: 1, gy: 0, gw: 1, gh: 1, strength: -700 },
      { gx: 1, gy: 0, gw: 1, gh: 1, strength: -700 },
    ]);
    expect(Array.from(field.values)).toEqual([ZONE_WIND_MAX, -ZONE_WIND_MAX]);
  });

  it("rebuild replaces the previous field rather than adding to it", () => {
    const field = new WindField(2, 1, 4);
    field.rebuild([{ gx: 0, gy: 0, gw: 2, gh: 1, strength: 300 }]);
    field.rebuild([]);
    expect(Array.from(field.values)).toEqual([0, 0]);
  });

  it("atPixel reads the cell under a pixel position, and 0 outside the grid", () => {
    const field = new WindField(2, 2, 4);
    field.rebuild([{ gx: 1, gy: 1, gw: 1, gh: 1, strength: 400 }]);
    expect(field.atPixel(5, 5)).toBe(400);
    expect(field.atPixel(1, 1)).toBe(0);
    expect(field.atPixel(-1, 5)).toBe(0);
    expect(field.atPixel(5, -20)).toBe(0);
    expect(field.atPixel(8, 5)).toBe(0);
    expect(field.atPixel(5, 8)).toBe(0);
  });
});

describe("normalizeZoneRect", () => {
  it("snaps a drag to the cells it touches", () => {
    expect(normalizeZoneRect(5, 9, 14, 13, 4, 10, 10, 300)).toEqual({ gx: 1, gy: 2, gw: 3, gh: 2, strength: 300 });
  });

  it("produces the same zone for a reversed drag", () => {
    expect(normalizeZoneRect(14, 13, 5, 9, 4, 10, 10, 300)).toEqual(normalizeZoneRect(5, 9, 14, 13, 4, 10, 10, 300));
  });

  it("clamps a drag that runs off the canvas to the grid", () => {
    expect(normalizeZoneRect(-50, -50, 500, 500, 4, 10, 8, -200)).toEqual({ gx: 0, gy: 0, gw: 10, gh: 8, strength: -200 });
  });

  it("returns null for a drag that stays within one cell (a plain click)", () => {
    expect(normalizeZoneRect(4, 4, 7, 7, 4, 10, 10, 300)).toBeNull();
  });

  it("returns null at zero strength", () => {
    expect(normalizeZoneRect(0, 0, 20, 20, 4, 10, 10, 0)).toBeNull();
  });
});
