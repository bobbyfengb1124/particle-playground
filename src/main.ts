import "./style.css";
import { readLaunchOptions } from "./app/launchOptions";
import { DEFAULT_CELL_SIZE, DEFAULT_GRAVITY, DEFAULT_PARTICLE_CAPACITY, Simulation } from "./app/Simulation";
import { CpuBackend } from "./backend/cpu/CpuBackend";
import { GpuBackend } from "./backend/gpu/GpuBackend";
import type { SimBackend } from "./backend/SimBackend";
import { createFixedTimestepLoop } from "./core/Clock";
import type { CanvasPoint } from "./input/PointerInput";
import { PointerInput } from "./input/PointerInput";
import { createOverlay } from "./ui/Overlay";
import { createReadout } from "./ui/Readout";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvas) throw new Error("missing #scene canvas");
const overlayCanvas = document.querySelector<HTMLCanvasElement>("#overlay-canvas");
if (!overlayCanvas) throw new Error("missing #overlay-canvas");

canvas.width = overlayCanvas.width = 960;
canvas.height = overlayCanvas.height = 540;

const overlayCtx = overlayCanvas.getContext("2d");
if (!overlayCtx) throw new Error("2d context unavailable");

const banner = document.querySelector<HTMLDivElement>("#banner");
if (!banner) throw new Error("missing #banner");
const showBanner = (text: string): void => {
  banner.textContent = text;
  banner.hidden = false;
};

const launch = readLaunchOptions(location.search);
const gpuBackend =
  launch.backend === "gpu"
    ? await GpuBackend.create({
        width: canvas.width,
        height: canvas.height,
        cellSize: launch.cellSize ?? 1,
        seed: 1,
        canvas,
        allowFallback: true,
      })
    : null;
if (launch.backend === "gpu" && !gpuBackend) showBanner("WebGPU unavailable — running on CPU");

const backend: SimBackend =
  gpuBackend ??
  new CpuBackend({
    width: canvas.width,
    height: canvas.height,
    cellSize: launch.cellSize ?? DEFAULT_CELL_SIZE,
    seed: 1,
    particleCapacity: DEFAULT_PARTICLE_CAPACITY,
    gravity: DEFAULT_GRAVITY,
    canvas,
  });
const sim = new Simulation({ width: canvas.width, height: canvas.height, backend });

// Drag-to-paint: pointerdown starts a stroke, pointermove extends it from the
// last point (so fast drags don't leave gaps between brush stamps), pointerup
// ends it. In "launch" mode the same gesture instead means click-drag-release:
// pointerdown just remembers the launch point, and the actual rocket only
// fires on pointerup, once the full drag distance (i.e. power) is known.
// "wind-zone" mode works the same way: the drag previews a rectangle, and
// the zone is only created on pointerup.
const input = new PointerInput(overlayCanvas);
let lastPaintPoint: CanvasPoint | null = null;
let launchStartPoint: CanvasPoint | null = null;
let zoneStartPoint: CanvasPoint | null = null;

input.onDown((point) => {
  if (sim.mode === "launch") {
    launchStartPoint = point;
    return;
  }
  if (sim.mode === "wind-zone") {
    zoneStartPoint = point;
    return;
  }
  lastPaintPoint = point;
  sim.paintAt(point.x, point.y);
});
input.onMove((point) => {
  sim.setHoverPoint(point.x, point.y);
  if (zoneStartPoint) {
    sim.setZoneDraft(zoneStartPoint.x, zoneStartPoint.y, point.x, point.y);
    return;
  }
  if (sim.mode !== "paint" || !lastPaintPoint) return;
  sim.paintStroke(lastPaintPoint.x, lastPaintPoint.y, point.x, point.y);
  lastPaintPoint = point;
});
input.onUp((point) => {
  if (launchStartPoint) {
    sim.launchFromDrag(launchStartPoint.x, launchStartPoint.y, point.x, point.y);
    launchStartPoint = null;
  }
  if (zoneStartPoint) {
    sim.addWindZoneFromDrag(zoneStartPoint.x, zoneStartPoint.y, point.x, point.y);
    zoneStartPoint = null;
    sim.clearZoneDraft();
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
// remaining finger is once back down to a single pointer. A zone drag is
// cancelled outright, since the second pointer means onUp never fires for it.
input.onPinchStart(() => {
  lastPaintPoint = null;
  zoneStartPoint = null;
  sim.clearZoneDraft();
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
    sim.render(overlayCtx);
    readout.tick();
    overlay.syncBrushSlider();
    overlay.syncZoneCount();
  },
});

gpuBackend?.onDeviceLost(() => {
  clock.stop();
  showBanner("GPU device lost — reload");
});

clock.start();
