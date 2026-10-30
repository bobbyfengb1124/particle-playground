import type { Simulation } from "../app/Simulation";

const FPS_WINDOW_MS = 750;
const DOM_UPDATE_INTERVAL_MS = 250;

/**
 * Backend/FPS/particle-count/active-cell-count HUD, following the same convention as
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
  const backendLabel = `Backend: ${sim.backend.kind} · ${sim.backend.cellSize} px`;
  // The GPU has no active set, so it reports non-empty cells instead (BackendStats.activeCellCount).
  const cellsLabel = sim.backend.kind === "gpu" ? "Non-empty cells" : "Active cells";
  const initial = sim.getStats();
  const initialGpu = initial.gpuMs === undefined ? "" : ` | GPU: ${initial.gpuMs ? "—" : "n/a"}`;

  container.textContent = `${backendLabel} | FPS: — | Particles: 0 | ${cellsLabel}: 0${initialGpu} | Brush: ${initial.brushSize}`;

  return {
    tick(): void {
      const now = performance.now();
      frameTimes.push(now);
      while (frameTimes.length > 0 && frameTimes[0] < now - FPS_WINDOW_MS) frameTimes.shift();

      if (now - lastDomUpdate < DOM_UPDATE_INTERVAL_MS) return;
      lastDomUpdate = now;

      const windowSeconds = Math.min(now, FPS_WINDOW_MS) / 1000;
      const fps = windowSeconds > 0 ? Math.round(frameTimes.length / windowSeconds) : 0;
      const { particleCount, activeCellCount, brushSize, gpuMs } = sim.getStats();
      const gpu =
        gpuMs === undefined ? "" : ` | GPU: ${gpuMs ? `sim ${gpuMs.sim.toFixed(1)} ms · draw ${gpuMs.draw.toFixed(1)} ms` : "n/a"}`;
      container.textContent = `${backendLabel} | FPS: ${fps} | Particles: ${particleCount} | ${cellsLabel}: ${activeCellCount}${gpu} | Brush: ${brushSize}`;
    },
  };
}
