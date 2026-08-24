import type { Simulation } from "../../../src/app/Simulation";

/** Steps a Simulation deterministically, without rAF or the wall clock. */
export function runTicks(sim: Simulation, ticks: number, fixedDt = 1 / 60): void {
  for (let i = 0; i < ticks; i++) sim.tick(fixedDt);
}
