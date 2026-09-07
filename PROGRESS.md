# Progress

Build plan: one step at a time, in order. Each step is implemented, tested (`npm test` + browser verification against its own spec testing criteria), committed, then paused for go-ahead before the next.

- [x] **Step 0 — Environment setup**: Vite + TypeScript + Vitest scaffold, `git init`, first commit.
- [x] **Step 1 — Render loop & particle emitter**: canvas render loop, click-spawn particles with position/velocity/acceleration integration, fade-out + expiry.
- [x] **Step 2 — Forces**: gravity, adjustable wind, drag, edge/floor bounce with damping.
- [x] **Step 3 — Falling sand**: CA grid (empty/sand), falling rule, ordered/double-buffered tick.
- [x] **Step 4 — Liquids & stone**: water (spreads to level), oil (floats on water), stone (immovable).
- [x] **Step 5 — Fire, smoke, steam**: wood (flammable), fire (ignite + burn out), smoke (drift + dissipate), steam (water ↔ fire conversion).
- [x] **Step 6 — Interactivity**: material palette + eraser, brush size, drag-to-paint, clear grid, pause/resume.
- [x] **Step 7 — Fireworks**: click-drag-release launch, 4 ember patterns (ring, willow, crossette, strobe), low-burst ember ignition of the grid.
- [ ] **Step 8 — Performance**: fixed-timestep loop (built in Step 1), active-cell skip optimization switched on, particle pool cap, FPS/particle-count/active-cell readout.

Architecture and full decision record: see the build plan.
