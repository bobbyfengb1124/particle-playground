import { describe, expect, it } from "vitest";
import { SoundDirector, type SoundEvents } from "../../src/audio/SoundDirector";

const quiet: SoundEvents = { launchPowers: [], bursts: 0, fireArea: 0 };
const mid = () => 0.5; // random() = 0.5 means ×1.00, so no variation

describe("SoundDirector (Step 18)", () => {
  it("starts at most 4 booms in any 100 ms (Q5/Q17)", () => {
    const d = new SoundDirector(mid);
    expect(d.update({ ...quiet, bursts: 6 }, false, true, 0).starts).toHaveLength(4);
    expect(d.update({ ...quiet, bursts: 1 }, false, true, 50).starts).toHaveLength(0);
    expect(d.update({ ...quiet, bursts: 1 }, false, true, 120).starts).toHaveLength(1);
  });

  it("caps whooshes separately from booms, keeping the first launches", () => {
    const d = new SoundDirector(mid);
    const { starts } = d.update({ launchPowers: [0, 0, 0, 0, 1], bursts: 4, fireArea: 0 }, false, true, 0);
    expect(starts.filter((s) => s.kind === "boom")).toHaveLength(4);
    expect(starts.filter((s) => s.kind === "whoosh")).toEqual(Array(4).fill({ kind: "whoosh", duration: 0.35 }));
  });

  it("sets whoosh length from power, varied by ±15% (Q16/Q7)", () => {
    expect(new SoundDirector(mid).update({ ...quiet, launchPowers: [1] }, false, true, 0).starts)
      .toEqual([{ kind: "whoosh", duration: 0.85 }]);
    const low = new SoundDirector(() => 0).update({ ...quiet, launchPowers: [1], bursts: 1 }, false, true, 0).starts;
    expect(low[0]).toEqual({ kind: "boom", rate: 0.85 });
    expect(low[1]).toEqual({ kind: "whoosh", duration: expect.closeTo(0.85 * 0.85) });
  });

  it("follows the square root of the fire area, capped at 1 (Q15)", () => {
    const d = new SoundDirector(mid);
    expect(d.update(quiet, false, true, 0).crackle).toBe(0);
    expect(d.update({ ...quiet, fireArea: 5_000 }, false, true, 0).crackle).toBeCloseTo(0.5);
    expect(d.update({ ...quiet, fireArea: 80_000 }, false, true, 0).crackle).toBe(1);
  });

  it("is silent while paused or disabled, and doesn't queue what it dropped (Q6/Q4)", () => {
    const d = new SoundDirector(mid);
    const busy: SoundEvents = { launchPowers: [1], bursts: 2, fireArea: 5_000 };
    expect(d.update(busy, true, true, 0)).toEqual({ starts: [], crackle: 0 });
    expect(d.update(busy, false, false, 0)).toEqual({ starts: [], crackle: 0 });
    expect(d.update(quiet, false, true, 10).starts).toEqual([]); // nothing replayed on resume
    expect(d.update({ ...quiet, bursts: 4 }, false, true, 10).starts).toHaveLength(4); // the dropped ones didn't use up the cap
  });
});
