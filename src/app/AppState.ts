import { FireworkPattern, type FireworkPatternValue } from "../core/types";
import { Material, type MaterialIdValue } from "../grid/materials";

/** Which pointer-drag interaction canvas clicks currently perform. */
export type InteractionMode = "paint" | "launch";

/** User-adjustable simulation settings, wired to real HTML controls in ui/Overlay.ts. */
export class AppState {
  wind = 0;
  selectedMaterial: MaterialIdValue = Material.SAND;
  /** Brush radius in grid cells; 0 paints a single cell. */
  brushSize = 1;
  mode: InteractionMode = "paint";
  fireworkPattern: FireworkPatternValue = FireworkPattern.RING;
}
