import "./style.css";
import { Simulation } from "./app/Simulation";
import { createFixedTimestepLoop } from "./core/Clock";
import type { CanvasPoint } from "./input/PointerInput";
import { PointerInput } from "./input/PointerInput";
import { createOverlay } from "./ui/Overlay";
import { createReadout } from "./ui/Readout";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvas) throw new Error("missing #scene canvas");

canvas.width = 960;
canvas.height = 540;

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");

const sim = new Simulation({ width: canvas.width, height: canvas.height, seed: 1 });

// Drag-to-paint: pointerdown starts a stroke, pointermove extends it from the
// last point (so fast drags don't leave gaps between brush stamps), pointerup
// ends it. In "launch" mode the same gesture instead means click-drag-release:
// pointerdown just remembers the launch point, and the actual rocket only
// fires on pointerup, once the full drag distance (i.e. power) is known.
const input = new PointerInput(canvas);
let lastPaintPoint: CanvasPoint | null = null;
let launchStartPoint: CanvasPoint | null = null;

input.onDown((point) => {
  if (sim.mode === "launch") {
    launchStartPoint = point;
    return;
  }
  lastPaintPoint = point;
  sim.paintAt(point.x, point.y);
});
input.onMove((point) => {
  sim.setHoverPoint(point.x, point.y);
  if (sim.mode === "launch" || !lastPaintPoint) return;
  sim.paintStroke(lastPaintPoint.x, lastPaintPoint.y, point.x, point.y);
  lastPaintPoint = point;
});
input.onUp((point) => {
  if (launchStartPoint) {
    sim.launchFromDrag(launchStartPoint.x, launchStartPoint.y, point.x, point.y);
    launchStartPoint = null;
  }
  lastPaintPoint = null;
});
input.onLeave(() => sim.clearHoverPoint());

// Scroll wheel resizes the brush (scroll up = bigger); only hijacked in paint
// mode — in launch mode the page's normal wheel behavior is left alone.
input.onWheel((evt) => {
  if (sim.mode !== "paint") return;
  evt.preventDefault();
  sim.adjustBrushSize(evt.deltaY < 0 ? 1 : -1);
});

// Pinch also resizes the brush. A second finger joining mid-stroke pauses
// painting for the gesture's duration; it resumes from wherever the
// remaining finger is once back down to a single pointer.
input.onPinchStart(() => {
  lastPaintPoint = null;
});
input.onPinchChange((steps) => {
  sim.adjustBrushSize(steps);
});
input.onPinchEnd((remainingPoint) => {
  if (sim.mode === "paint") lastPaintPoint = remainingPoint;
});

const overlayContainer = document.querySelector<HTMLDivElement>("#overlay");
if (!overlayContainer) throw new Error("missing #overlay container");
const overlay = createOverlay(overlayContainer, sim);

const readoutContainer = document.querySelector<HTMLDivElement>("#readout");
if (!readoutContainer) throw new Error("missing #readout container");
const readout = createReadout(readoutContainer, sim);

const clock = createFixedTimestepLoop({
  simHz: 60,
  update: (dt) => sim.tick(dt),
  render: () => {
    sim.render(ctx);
    readout.tick();
    overlay.syncBrushSlider();
  },
});

clock.start();
