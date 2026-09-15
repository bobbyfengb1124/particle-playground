import type { Simulation } from "../app/Simulation";
import { FireworkPattern, type FireworkPatternValue } from "../core/types";
import { Material, MATERIALS, type MaterialIdValue } from "../grid/materials";

const FIREWORK_PATTERNS: ReadonlyArray<{ id: FireworkPatternValue; label: string }> = [
  { id: FireworkPattern.RING, label: "Ring" },
  { id: FireworkPattern.WILLOW, label: "Willow" },
  { id: FireworkPattern.CROSSETTE, label: "Crossette" },
  { id: FireworkPattern.STROBE, label: "Strobe" },
];

// Smoke/steam are byproducts of fire/water, not something a user paints
// directly — the palette only offers materials meant to be placed.
const PALETTE_MATERIALS: readonly MaterialIdValue[] = [
  Material.SAND,
  Material.WATER,
  Material.OIL,
  Material.ACID,
  Material.STONE,
  Material.WOOD,
  Material.FIRE,
];

interface SliderSpec {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onInput: (value: number) => void;
}

function createSlider(container: HTMLElement, spec: SliderSpec): void {
  const label = document.createElement("label");
  label.htmlFor = spec.id;
  label.textContent = spec.label;

  const slider = document.createElement("input");
  slider.id = spec.id;
  slider.type = "range";
  slider.min = String(spec.min);
  slider.max = String(spec.max);
  slider.step = String(spec.step);
  slider.value = String(spec.value);
  slider.addEventListener("input", () => spec.onInput(Number(slider.value)));

  container.append(label, slider);
}

/** Creates a button wired to `onClick`, appended to `container`, and returns it so callers can add per-button extras (a swatch color, a tracking Map entry). */
function createButton(container: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  container.appendChild(btn);
  return btn;
}

/** Material swatches, an eraser, and a Launch tool — exactly one is ever active, deciding what a canvas click/drag does. */
function createPaletteControl(container: HTMLElement, sim: Simulation): void {
  const palette = document.createElement("div");
  palette.id = "palette";

  const buttons = new Map<MaterialIdValue, HTMLButtonElement>();
  let launchBtn!: HTMLButtonElement;
  const activate = (btn: HTMLButtonElement): void => {
    for (const b of buttons.values()) b.classList.toggle("active", b === btn);
    launchBtn.classList.toggle("active", btn === launchBtn);
  };

  const selectMaterial = (material: MaterialIdValue): void => {
    sim.setMode("paint");
    sim.setSelectedMaterial(material);
    activate(buttons.get(material)!);
  };

  for (const material of PALETTE_MATERIALS) {
    const info = MATERIALS[material];
    const btn = createButton(palette, info.name, () => selectMaterial(material));
    btn.style.setProperty("--swatch", `rgb(${info.color.join(",")})`);
    buttons.set(material, btn);
  }

  const eraserBtn = createButton(palette, "Eraser", () => selectMaterial(Material.EMPTY));
  eraserBtn.style.setProperty("--swatch", `rgb(${MATERIALS[Material.EMPTY].color.join(",")})`);
  buttons.set(Material.EMPTY, eraserBtn);

  launchBtn = createButton(palette, "Launch", () => {
    sim.setMode("launch");
    activate(launchBtn);
  });
  launchBtn.style.setProperty("--swatch", "rgb(255, 200, 60)");

  if (sim.mode === "launch") activate(launchBtn);
  else activate(buttons.get(sim.selectedMaterial)!);

  container.appendChild(palette);
}

/** Ring/Willow/Crossette/Strobe — which pattern the next rocket bursts into, following the same button-group convention as the material palette. */
function createFireworkPatternControl(container: HTMLElement, sim: Simulation): void {
  const group = document.createElement("div");
  group.id = "firework-patterns";

  const buttons = new Map<FireworkPatternValue, HTMLButtonElement>();
  const select = (pattern: FireworkPatternValue): void => {
    sim.setFireworkPattern(pattern);
    for (const [id, btn] of buttons) btn.classList.toggle("active", id === pattern);
  };

  for (const { id, label } of FIREWORK_PATTERNS) {
    const btn = createButton(group, label, () => select(id));
    buttons.set(id, btn);
  }

  select(sim.fireworkPattern);
  container.appendChild(group);
}

function createClearButton(container: HTMLElement, sim: Simulation): void {
  createButton(container, "Clear", () => sim.clearGrid());
}

function createPauseButton(container: HTMLElement, sim: Simulation): void {
  const refreshLabel = (): void => {
    btn.textContent = sim.isPaused ? "Resume" : "Pause";
  };
  const btn = createButton(container, sim.isPaused ? "Resume" : "Pause", () => {
    if (sim.isPaused) sim.resume();
    else sim.pause();
    refreshLabel();
  });
}

/**
 * Wires real HTML controls into `container`, calling only Simulation's public
 * methods — never reaching into ParticleSystem/Grid directly. Keeps the UI a
 * thin DOM-event translator so tests can drive the same public API headlessly.
 */
export function createOverlay(container: HTMLElement, sim: Simulation): void {
  createSlider(container, {
    id: "wind-slider",
    label: "Wind",
    min: -400,
    max: 400,
    step: 10,
    value: sim.wind,
    onInput: (v) => sim.setWind(v),
  });
  createPaletteControl(container, sim);
  createFireworkPatternControl(container, sim);
  createSlider(container, {
    id: "brush-slider",
    label: "Brush",
    min: 0,
    max: 8,
    step: 1,
    value: sim.brushSize,
    onInput: (v) => sim.setBrushSize(v),
  });
  createClearButton(container, sim);
  createPauseButton(container, sim);
}
