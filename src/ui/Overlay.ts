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

/**
 * Wires real HTML controls into `container`, calling only Simulation's public
 * methods — never reaching into ParticleSystem/Grid directly. Keeps the UI a
 * thin DOM-event translator so tests can drive the same public API headlessly.
 */
export function createOverlay(container: HTMLElement, sim: Simulation): void {
  const windLabel = document.createElement("label");
  windLabel.htmlFor = "wind-slider";
  windLabel.textContent = "Wind";

  const windSlider = document.createElement("input");
  windSlider.id = "wind-slider";
  windSlider.type = "range";
  windSlider.min = "-400";
  windSlider.max = "400";
  windSlider.step = "10";
  windSlider.value = String(sim.wind);
  windSlider.addEventListener("input", () => {
    sim.setWind(Number(windSlider.value));
  });

  container.append(windLabel, windSlider);

  const palette = document.createElement("div");
  palette.id = "palette";

  const paletteButtons = new Map<MaterialIdValue, HTMLButtonElement>();
  const selectMaterial = (material: MaterialIdValue): void => {
    sim.setSelectedMaterial(material);
    for (const [id, btn] of paletteButtons) btn.classList.toggle("active", id === material);
  };

  for (const material of PALETTE_MATERIALS) {
    const info = MATERIALS[material];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = info.name;
    btn.style.setProperty("--swatch", `rgb(${info.color.join(",")})`);
    btn.addEventListener("click", () => selectMaterial(material));
    paletteButtons.set(material, btn);
    palette.appendChild(btn);
  }

  const eraserBtn = document.createElement("button");
  eraserBtn.type = "button";
  eraserBtn.textContent = "Eraser";
  eraserBtn.style.setProperty("--swatch", `rgb(${MATERIALS[Material.EMPTY].color.join(",")})`);
  eraserBtn.addEventListener("click", () => selectMaterial(Material.EMPTY));
  paletteButtons.set(Material.EMPTY, eraserBtn);
  palette.appendChild(eraserBtn);

  selectMaterial(sim.selectedMaterial);
  container.appendChild(palette);

  const brushLabel = document.createElement("label");
  brushLabel.htmlFor = "brush-slider";
  brushLabel.textContent = "Brush";

  const brushSlider = document.createElement("input");
  brushSlider.id = "brush-slider";
  brushSlider.type = "range";
  brushSlider.min = "0";
  brushSlider.max = "8";
  brushSlider.step = "1";
  brushSlider.value = String(sim.brushSize);
  brushSlider.addEventListener("input", () => {
    sim.setBrushSize(Number(brushSlider.value));
  });

  container.append(brushLabel, brushSlider);

  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.textContent = "Clear";
  clearBtn.addEventListener("click", () => sim.clearGrid());
  container.appendChild(clearBtn);

  const pauseBtn = document.createElement("button");
  pauseBtn.type = "button";
  const refreshPauseLabel = (): void => {
    pauseBtn.textContent = sim.isPaused ? "Resume" : "Pause";
  };
  refreshPauseLabel();
  pauseBtn.addEventListener("click", () => {
    if (sim.isPaused) sim.resume();
    else sim.pause();
    refreshPauseLabel();
  });
  container.appendChild(pauseBtn);
}
