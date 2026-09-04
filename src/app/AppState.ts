import { Material, type MaterialIdValue } from "../grid/materials";

/** User-adjustable simulation settings, wired to real HTML controls in ui/Overlay.ts. */
export class AppState {
  wind = 0;
  selectedMaterial: MaterialIdValue = Material.SAND;
  /** Brush radius in grid cells; 0 paints a single cell. */
  brushSize = 1;
}
