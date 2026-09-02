import "./style.css";
import { Simulation } from "./app/Simulation";
import { createFixedTimestepLoop } from "./core/Clock";
import { Material } from "./grid/materials";
import { PointerInput } from "./input/PointerInput";
import { createOverlay } from "./ui/Overlay";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
if (!canvas) throw new Error("missing #scene canvas");

canvas.width = 960;
canvas.height = 540;

const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("2d context unavailable");

const sim = new Simulation({ width: canvas.width, height: canvas.height, seed: 1 });

// Temporary Step 3 demo seed — matches the spec's own "programmatically fill a
// vertical line of sand cells near the top" test setup, so there's something
// to look at before Step 6 adds real painting.
const seedColumn = Math.floor(sim.grid.width / 2);
for (let y = 0; y < 10; y++) sim.grid.setMaterial(seedColumn, y, Material.SAND);

// Temporary Step 4 demo seed — a stone-walled basin with standing water and
// an oil column dropped in among it, so leveling and floating are visible
// before Step 6 adds real painting.
{
  const { grid } = sim;
  const left = grid.width - 90;
  const right = grid.width - 10;
  const floorY = grid.height - 1;
  for (let x = left; x <= right; x++) grid.setMaterial(x, floorY, Material.STONE);
  for (let y = floorY - 40; y <= floorY; y++) {
    grid.setMaterial(left, y, Material.STONE);
    grid.setMaterial(right, y, Material.STONE);
  }
  for (let y = floorY - 15; y < floorY; y++) {
    for (let x = left + 1; x < right; x++) grid.setMaterial(x, y, Material.WATER);
  }
  // Submerged under several rows of water, so it has to rise to float.
  const oilColumn = left + 20;
  for (let y = floorY - 5; y < floorY - 1; y++) grid.setMaterial(oilColumn, y, Material.OIL);
}

// Temporary Step 5 demo seed — a stone-walled wood structure with one
// corner already on fire and a water puddle touching that same corner, so
// ignition spread, burnout-to-smoke, and steam formation/condensation are
// all visible before Step 6 adds real painting.
{
  const { grid } = sim;
  const left = 24;
  const right = 61;
  const floorY = grid.height - 1;
  for (let x = left; x <= right; x++) grid.setMaterial(x, floorY, Material.STONE);
  for (let y = floorY - 30; y <= floorY; y++) {
    grid.setMaterial(left, y, Material.STONE);
    grid.setMaterial(right, y, Material.STONE);
  }
  const woodLeft = 30;
  const woodRight = 55;
  for (let y = floorY - 24; y < floorY; y++) {
    for (let x = woodLeft; x <= woodRight; x++) grid.setMaterial(x, y, Material.WOOD);
  }
  for (let y = floorY - 1; y >= floorY - 2; y--) {
    for (let x = 26; x <= 29; x++) grid.setMaterial(x, y, Material.WATER);
  }
  grid.setMaterial(woodLeft, floorY - 1, Material.FIRE); // ignite the corner touching the puddle
}

const input = new PointerInput(canvas);
input.onDown((point) => sim.spawnParticlesAt(point.x, point.y, 8));

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
