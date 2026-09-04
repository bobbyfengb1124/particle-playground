import { Material, MATERIALS, type MaterialIdValue } from "../grid/materials";

// Each interface is exactly the slice of Simulation one control group
// touches — createOverlay depends on their intersection, not the concrete
// Simulation class, so e.g. createPauseButton can't reach into painting
// settings it has no business seeing, and a future control only needs a
// new small interface, never a change to an existing one.
export interface WindControl {
  readonly wind: number;
  setWind(wind: number): void;
}

export interface MaterialControl {
  readonly selectedMaterial: MaterialIdValue;
  setSelectedMaterial(material: MaterialIdValue): void;
}

export interface BrushControl {
  readonly brushSize: number;
  setBrushSize(size: number): void;
}

export interface ClearControl {
  clearGrid(): void;
}

export interface PauseControl {
  readonly isPaused: boolean;
  pause(): void;
  resume(): void;
}

export type OverlaySimulation = WindControl & MaterialControl & BrushControl & ClearControl & PauseControl;

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

function createWindControl(container: HTMLElement, sim: WindControl): void {
  const label = document.createElement("label");
  label.htmlFor = "wind-slider";
  label.textContent = "Wind";

  const slider = document.createElement("input");
  slider.id = "wind-slider";
  slider.type = "range";
  slider.min = "-400";
  slider.max = "400";
  slider.step = "10";
  slider.value = String(sim.wind);
  slider.addEventListener("input", () => sim.setWind(Number(slider.value)));

  container.append(label, slider);
}

function createPaletteControl(container: HTMLElement, sim: MaterialControl): void {
  const palette = document.createElement("div");
  palette.id = "palette";

  const buttons = new Map<MaterialIdValue, HTMLButtonElement>();
  const select = (material: MaterialIdValue): void => {
    sim.setSelectedMaterial(material);
    for (const [id, btn] of buttons) btn.classList.toggle("active", id === material);
  };

  for (const material of PALETTE_MATERIALS) {
    const info = MATERIALS[material];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = info.name;
    btn.style.setProperty("--swatch", `rgb(${info.color.join(",")})`);
    btn.addEventListener("click", () => select(material));
    buttons.set(material, btn);
    palette.appendChild(btn);
  }

  const eraserBtn = document.createElement("button");
  eraserBtn.type = "button";
  eraserBtn.textContent = "Eraser";
  eraserBtn.style.setProperty("--swatch", `rgb(${MATERIALS[Material.EMPTY].color.join(",")})`);
  eraserBtn.addEventListener("click", () => select(Material.EMPTY));
  buttons.set(Material.EMPTY, eraserBtn);
  palette.appendChild(eraserBtn);

  select(sim.selectedMaterial);
  container.appendChild(palette);
}

function createBrushControl(container: HTMLElement, sim: BrushControl): void {
  const label = document.createElement("label");
  label.htmlFor = "brush-slider";
  label.textContent = "Brush";

  const slider = document.createElement("input");
  slider.id = "brush-slider";
  slider.type = "range";
  slider.min = "0";
  slider.max = "8";
  slider.step = "1";
  slider.value = String(sim.brushSize);
  slider.addEventListener("input", () => sim.setBrushSize(Number(slider.value)));

  container.append(label, slider);
}

function createClearButton(container: HTMLElement, sim: ClearControl): void {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "Clear";
  btn.addEventListener("click", () => sim.clearGrid());
  container.appendChild(btn);
}

function createPauseButton(container: HTMLElement, sim: PauseControl): void {
  const btn = document.createElement("button");
  btn.type = "button";
  const refreshLabel = (): void => {
    btn.textContent = sim.isPaused ? "Resume" : "Pause";
  };
  refreshLabel();
  btn.addEventListener("click", () => {
    if (sim.isPaused) sim.resume();
    else sim.pause();
    refreshLabel();
  });
  container.appendChild(btn);
}

/**
 * Wires real HTML controls into `container`, calling only Simulation's public
 * methods — never reaching into ParticleSystem/Grid directly. Keeps the UI a
 * thin DOM-event translator so tests can drive the same public API headlessly.
 */
export function createOverlay(container: HTMLElement, sim: OverlaySimulation): void {
  createWindControl(container, sim);
  createPaletteControl(container, sim);
  createBrushControl(container, sim);
  createClearButton(container, sim);
  createPauseButton(container, sim);
}
