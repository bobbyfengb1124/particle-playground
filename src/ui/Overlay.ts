import type { Simulation } from "../app/Simulation";
import { Material, MATERIALS, type MaterialIdValue } from "../grid/materials";

// Smoke/steam are byproducts of fire/water, not something a user paints
// directly — the palette only offers materials meant to be placed.
const PALETTE_MATERIALS: readonly MaterialIdValue[] = [
  Material.SAND,
  Material.WATER,
  Material.OIL,
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

function createPaletteControl(container: HTMLElement, sim: Simulation): void {
  const palette = document.createElement("div");
  palette.id = "palette";

  const buttons = new Map<MaterialIdValue, HTMLButtonElement>();
  const select = (material: MaterialIdValue): void => {
    sim.setSelectedMaterial(material);
    for (const [id, btn] of buttons) btn.classList.toggle("active", id === material);
  };

  for (const material of PALETTE_MATERIALS) {
    const info = MATERIALS[material];
    const btn = createButton(palette, info.name, () => select(material));
    btn.style.setProperty("--swatch", `rgb(${info.color.join(",")})`);
    buttons.set(material, btn);
  }

  const eraserBtn = createButton(palette, "Eraser", () => select(Material.EMPTY));
  eraserBtn.style.setProperty("--swatch", `rgb(${MATERIALS[Material.EMPTY].color.join(",")})`);
  buttons.set(Material.EMPTY, eraserBtn);

  select(sim.selectedMaterial);
  container.appendChild(palette);
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
