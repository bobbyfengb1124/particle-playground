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
- [x] **Step 8 — Performance**: fixed-timestep loop (built in Step 1), active-cell skip optimization switched on, particle pool cap, FPS/particle-count/active-cell readout.
- [x] **Step 9 — Acid**: new liquid material that dissolves any non-immune material it touches (stone and acid itself are immune), a mutual 1-for-1 consumption on contact, falling back to ordinary liquid movement when nothing adjacent is dissolvable.
- [x] **Step 10 — Plant**: paintable seed that falls like sand but sinks through water/oil to reach solid ground, then grows into a plant stalk one stage at a time while adjacent to water, up to a 6-stage height cap.
- [x] **Step 11 — Ice**: paintable material that falls like sand (never sinks through liquids), and once landed melts to water when adjacent to fire or freezes every adjacent water cell otherwise.
- [x] **Step 12 — Scene save/load**: Save button exports the grid's material+timer state as a downloadable JSON file; Load button reads a JSON file back, validates it against the current grid's dimensions and cell data, and repopulates the grid (or shows an error and leaves the grid untouched).
- [x] **Step 13 — Brush resize gestures**: scroll wheel and pinch resize the brush (in addition to the existing slider, all three stay in sync), with a square on-canvas outline preview showing the actual brush footprint; pinch mid-stroke pauses painting and resumes once back to one finger. The eraser tool itself needed no changes — it already existed.
- [x] **Step 14 — Wind zones**: drag rectangles onto the canvas that push everything passing through them sideways — particles, rockets, embers, and rising smoke/steam (which now also lean with the global wind slider). Zones snap to grid cells, overlapping zones add up (capped at ±800), strength is set per zone from a "Zone wind" slider at draw time, up to 32 zones, a separate Clear Zones button, and zones are saved/loaded with the scene (older files load with no zones).

Architecture and full decision record: see the build plan.
