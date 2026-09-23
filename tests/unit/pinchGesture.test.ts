import { describe, expect, it } from "vitest";
import { PINCH_STEP_PX, PinchGestureTracker } from "../../src/input/PinchGesture";

describe("PinchGestureTracker", () => {
  it("reports 0 steps for movement under the threshold", () => {
    const tracker = new PinchGestureTracker();
    tracker.start({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(tracker.update({ x: 0, y: 0 }, { x: 100 + PINCH_STEP_PX - 1, y: 0 })).toBe(0);
  });

  it("emits +1 once the spread grows past one full threshold", () => {
    const tracker = new PinchGestureTracker();
    tracker.start({ x: 0, y: 0 }, { x: 100, y: 0 });
    expect(tracker.update({ x: 0, y: 0 }, { x: 100 + PINCH_STEP_PX, y: 0 })).toBe(1);
  });

  it("emits -1 when the spread shrinks past one full threshold", () => {
    const tracker = new PinchGestureTracker();
    tracker.start({ x: 0, y: 0 }, { x: 200, y: 0 });
    expect(tracker.update({ x: 0, y: 0 }, { x: 200 - PINCH_STEP_PX, y: 0 })).toBe(-1);
  });

  it("emits multiple steps at once for a big jump, and keeps unconsumed movement for next time", () => {
    const tracker = new PinchGestureTracker();
    tracker.start({ x: 0, y: 0 }, { x: 0, y: 0 });
    expect(tracker.update({ x: 0, y: 0 }, { x: PINCH_STEP_PX * 2 + 5, y: 0 })).toBe(2);
    // the leftover 5px plus another (PINCH_STEP_PX - 5) should cross exactly one more step
    expect(tracker.update({ x: 0, y: 0 }, { x: PINCH_STEP_PX * 3 + 5, y: 0 })).toBe(1);
  });

  it("returns 0 before start() has been called", () => {
    const tracker = new PinchGestureTracker();
    expect(tracker.update({ x: 0, y: 0 }, { x: 500, y: 0 })).toBe(0);
  });

  it("reset() clears the baseline so a subsequent update() is a no-op until start() again", () => {
    const tracker = new PinchGestureTracker();
    tracker.start({ x: 0, y: 0 }, { x: 100, y: 0 });
    tracker.reset();
    expect(tracker.update({ x: 0, y: 0 }, { x: 1000, y: 0 })).toBe(0);
  });

  it("a fresh start() resets the baseline, discarding any prior gesture's position", () => {
    const tracker = new PinchGestureTracker();
    tracker.start({ x: 0, y: 0 }, { x: 100, y: 0 });
    tracker.update({ x: 0, y: 0 }, { x: 100 + PINCH_STEP_PX, y: 0 });
    tracker.start({ x: 0, y: 0 }, { x: 500, y: 0 });
    expect(tracker.update({ x: 0, y: 0 }, { x: 500 + PINCH_STEP_PX - 1, y: 0 })).toBe(0);
  });
});
