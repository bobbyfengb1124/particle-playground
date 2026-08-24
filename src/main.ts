import "./style.css";
import { Simulation } from "./app/Simulation";
import { createFixedTimestepLoop } from "./core/Clock";
import { PointerInput } from "./input/PointerInput";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvas) throw new Error("missing #scene canvas");

canvas.width = 960;
canvas.height = 540;

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");

const sim = new Simulation({ width: canvas.width, height: canvas.height, seed: 1 });

const input = new PointerInput(canvas);
input.onDown((point) => sim.spawnParticlesAt(point.x, point.y, 8));

// Temporary readout satisfying Step 1's own testing criteria ("watch a particle
// counter"); Step 8 formalizes this into a full FPS/particle/active-cell readout.
const overlay = document.querySelector<HTMLDivElement>("#overlay");
const counter = document.createElement("span");
counter.id = "particle-count";
overlay?.appendChild(counter);

const clock = createFixedTimestepLoop({
  simHz: 60,
  update: (dt) => sim.tick(dt),
  render: () => {
    sim.render(ctx);
    counter.textContent = `Particles: ${sim.particles.activeCount}`;
  },
});

clock.start();
