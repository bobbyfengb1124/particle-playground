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
npm run dev    # start the dev server
npm test       # run unit + snapshot tests
```
