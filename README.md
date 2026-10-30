# Particle Playground

An interactive 2D canvas where you paint materials and watch them behave: sand piles up, water finds its level, fire spreads and burns out, and fireworks burst and rain embers onto whatever's painted underneath.

Built as an 8-step challenge combining two simulation techniques:

- A classic force-driven particle engine (position/velocity/acceleration, gravity/wind/drag, bounce).
- A cellular-automaton material grid (sand/water/oil/stone/wood/fire/smoke/steam, updated by local rules each tick).

The two are joined by a fireworks display: rockets and embers are particles, and low-bursting embers can ignite flammable material on the grid.

See `PROGRESS.md` for build status.

## Dev

```
npm install
npm run dev           # start the dev server
npm test              # run unit + snapshot tests
npm run test:gpu      # GPU parity tests in headless Chromium (SwiftShader; no GPU needed)
npm run test:browser  # click-through check on CPU then GPU (needs `npm run dev` and a real GPU)
```

`WEBGPU_ADAPTER=hardware npm run test:gpu` runs the GPU tests on your real GPU instead of SwiftShader.

## Browser & URL options

The simulation runs on the GPU (WebGPU) when the browser has a real GPU adapter, e.g. Chrome or Edge 113+ on desktop, and on the CPU otherwise. The readout's `Backend:` shows which one is active.

- `?backend=cpu` / `?backend=gpu` forces a backend. A forced `gpu` with no WebGPU shows a "WebGPU unavailable — running on CPU" banner. Any other value acts like no param.
- `?cell=1|2|4` sets the cell size in pixels (default: 1 on GPU, 4 on CPU).

## Readout

On the GPU, `GPU: sim X ms · draw Y ms` is the GPU time per frame, averaged since the last refresh, or `n/a` when the browser has no timestamp queries. Chrome rounds GPU timestamps to 0.1 ms; enable `chrome://flags/#enable-webgpu-developer-features` for exact numbers.
