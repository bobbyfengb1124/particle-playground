import type { Simulation } from "../app/Simulation";

const FPS_WINDOW_MS = 750;
const DOM_UPDATE_INTERVAL_MS = 250;

/**
 * FPS/particle-count/active-cell-count HUD, following the same convention as
 * `ui/Overlay.ts` — a thin module wired only to `Simulation`'s public API,
 * writing straight into the container element passed in.
 *
 * FPS is measured here (not in `Simulation`) because `tick(dt)` never reads
 * the wall clock by design (determinism); call `tick()` once per real
 * animation frame (not once per fixed sim step) so the frame-timestamp
 * buffer actually reflects render rate.
 */
export function createReadout(container: HTMLElement, sim: Simulation): { tick(): void } {
  const frameTimes: number[] = [];
  let lastDomUpdate = 0;

  container.textContent = `FPS: — | Particles: 0 | Active cells: 0 | Brush: ${sim.getStats().brushSize}`;

  return {
    tick(): void {
      const now = performance.now();
      frameTimes.push(now);
      while (frameTimes.length > 0 && frameTimes[0] < now - FPS_WINDOW_MS) frameTimes.shift();

      if (now - lastDomUpdate < DOM_UPDATE_INTERVAL_MS) return;
      lastDomUpdate = now;

      const windowSeconds = Math.min(now, FPS_WINDOW_MS) / 1000;
      const fps = windowSeconds > 0 ? Math.round(frameTimes.length / windowSeconds) : 0;
      const { particleCount, activeCellCount, brushSize } = sim.getStats();
      container.textContent = `FPS: ${fps} | Particles: ${particleCount} | Active cells: ${activeCellCount} | Brush: ${brushSize}`;
    },
  };
}
