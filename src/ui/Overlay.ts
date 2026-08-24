import type { Simulation } from "../app/Simulation";

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
}
