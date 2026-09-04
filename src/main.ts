import "./style.css";
import { Simulation } from "./app/Simulation";
import { createFixedTimestepLoop } from "./core/Clock";
import type { CanvasPoint } from "./input/PointerInput";
import { PointerInput } from "./input/PointerInput";
import { createOverlay } from "./ui/Overlay";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvas) throw new Error("missing #scene canvas");

canvas.width = 960;
canvas.height = 540;

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");

const sim = new Simulation({ width: canvas.width, height: canvas.height, seed: 1 });

// Drag-to-paint: pointerdown starts a stroke, pointermove extends it from the
// last point (so fast drags don't leave gaps between brush stamps), pointerup
// ends it.
const input = new PointerInput(canvas);
let lastPaintPoint: CanvasPoint | null = null;

input.onDown((point) => {
  lastPaintPoint = point;
  sim.paintAt(point.x, point.y);
});
input.onMove((point) => {
  if (!lastPaintPoint) return;
  sim.paintStroke(lastPaintPoint.x, lastPaintPoint.y, point.x, point.y);
  lastPaintPoint = point;
});
input.onUp(() => {
  lastPaintPoint = null;
});

const overlay = document.querySelector<HTMLDivElement>("#overlay");
if (!overlay) throw new Error("missing #overlay container");
createOverlay(overlay, sim);

// Temporary readout satisfying Step 1's own testing criteria ("watch a particle
// counter"); Step 8 formalizes this into a full FPS/particle/active-cell readout.
const counter = document.createElement("span");
counter.id = "particle-count";
overlay.appendChild(counter);

const clock = createFixedTimestepLoop({
  simHz: 60,
  update: (dt) => sim.tick(dt),
  render: () => {
    sim.render(ctx);
    counter.textContent = `Particles: ${sim.particles.activeCount}`;
  },
});

clock.start();
