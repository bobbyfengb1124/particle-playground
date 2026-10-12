import { describe, expect, it } from "vitest";
import { windPushThreshold, windThresholdTable } from "../../src/grid/rules/gas";
import { ZONE_WIND_MAX } from "../../src/wind/WindField";

describe("windThresholdTable", () => {
  const table = windThresholdTable();

  it("has one entry per whole strength 0..800, starting at 0 (no wind, no push)", () => {
    expect(table.length).toBe(ZONE_WIND_MAX + 1);
    expect(table[0]).toBe(0);
  });

  it("matches windPushThreshold at every entry, with no u32 overflow at full strength", () => {
    for (let w = 0; w <= ZONE_WIND_MAX; w++) expect(table[w]).toBe(windPushThreshold(w));
    expect(table[ZONE_WIND_MAX]).toBe(Math.ceil(0.8 * 2 ** 32));
  });
});
