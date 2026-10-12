// Shared by the compute shaders in grid.wgsl; prepended after buildPrelude().

struct Params {
  width: u32,
  height: u32,
  seed: u32,
  tick: u32,
  passIndex: u32,
  phaseX: u32,
  phaseY: u32,
  scale: u32, // 4 / cellSize: tickScale for lifetimes, cellRatio for the plant cap (always equal, as in PhasedStepper)
  globalWind: i32, // the wind slider, a whole number in -800..800; stepGas adds each cell's zone wind
}

@group(0) @binding(0) var<storage, read_write> cells: array<u32>;
@group(0) @binding(1) var<uniform> params: Params;
// Per-cell zone wind (WindField.values, already clamped to ±800), uploaded only when zones change.
@group(0) @binding(3) var<storage, read> zoneWind: array<i32>;
// windThresholdTable(): entry w is the push threshold for |wind| = w (0..800), uploaded once at create.
@group(0) @binding(4) var<storage, read> windThreshold: array<u32>;

// Twin of src/core/cellRng.ts. WGSL u32 `*` and `+` wrap on overflow, exactly like Math.imul and `>>> 0`.
fn hash32(v: u32) -> u32 {
  var x = v;
  x = x ^ (x >> 16u);
  x = x * 0x7feb352du;
  x = x ^ (x >> 15u);
  x = x * 0x846ca68bu;
  return x ^ (x >> 16u);
}

const GOLDEN: u32 = 0x9e3779b9u;

struct CellRng {
  base: u32,
  counter: u32,
}

fn cellRng(idx: u32) -> CellRng {
  let base = hash32(params.seed ^ hash32(params.tick ^ hash32(idx * 9u + params.passIndex)));
  return CellRng(base, 0u);
}

fn nextU32(rng: ptr<function, CellRng>) -> u32 {
  let draw = hash32((*rng).base + (*rng).counter * GOLDEN);
  (*rng).counter += 1u;
  return draw;
}

// Exactly `rng.next() < 0.5` on the CPU, since next() is nextU32() / 2^32.
fn rngBelowHalf(rng: ptr<function, CellRng>) -> bool {
  return nextU32(rng) < 0x80000000u;
}

// Twins of Grid's helpers. Coordinates are i32 because rules probe x - 1 / y + 1, which can go off the edge.
fn inBounds(x: i32, y: i32) -> bool {
  return x >= 0 && x < i32(params.width) && y >= 0 && y < i32(params.height);
}

fn cellIndex(x: i32, y: i32) -> u32 {
  return u32(y) * params.width + u32(x);
}

fn getMat(x: i32, y: i32) -> u32 {
  return cells[cellIndex(x, y)] & MATERIAL_MASK;
}

fn getTimer(x: i32, y: i32) -> u32 {
  return cells[cellIndex(x, y)] >> TIMER_SHIFT;
}

// The 8 neighbours, in the same order as the TS rules' NEIGHBOR_OFFSETS — order matters where a
// rule acts on the first match (acid dissolves the first, seed drinks the first water found).
var<private> NEIGHBORS: array<vec2<i32>, 8> = array(
  vec2(-1, -1), vec2(0, -1), vec2(1, -1),
  vec2(-1, 0), vec2(1, 0),
  vec2(-1, 1), vec2(0, 1), vec2(1, 1),
);

// Twin of Grid.transformMaterial: new material and timer, marked processed so the cell doesn't
// also run its new rule later this tick (wood that catches fire doesn't burn the same tick).
fn transformCell(x: i32, y: i32, mat: u32, timer: u32) {
  cells[cellIndex(x, y)] = mat | (timer << TIMER_SHIFT) | PROCESSED;
}

// Twin of Grid.resetTimer: timer back to 0, material and processed flag kept. Deliberately does
// NOT mark the cell processed — steam right above a fire must still get its own turn to rise
// (see the comment on Grid.resetTimer).
fn resetTimer(x: i32, y: i32) {
  let idx = cellIndex(x, y);
  cells[idx] = cells[idx] & ((1u << TIMER_SHIFT) - 1u);
}

// Twin of Grid.incrementTimer: stores timer + 1 wrapped to 16 bits but returns it unwrapped
// (65535 → stores 0, returns 65536), exactly as the CPU's Uint16Array store and `+ 1` do.
fn incrementTimer(x: i32, y: i32) -> u32 {
  let idx = cellIndex(x, y);
  let cell = cells[idx];
  cells[idx] = cell + (1u << TIMER_SHIFT);
  return (cell >> TIMER_SHIFT) + 1u;
}

// Twin of Grid.moveMaterial: the destination gets material + timer and is marked processed; the source becomes EMPTY with timer 0.
fn moveCell(fromX: i32, fromY: i32, toX: i32, toY: i32) {
  let fromIdx = cellIndex(fromX, fromY);
  cells[cellIndex(toX, toY)] = cells[fromIdx] | PROCESSED;
  cells[fromIdx] = MAT_EMPTY;
}

// Twin of Grid.swapMaterial: exchanges material + timer; both cells end up processed.
fn swapCells(aX: i32, aY: i32, bX: i32, bY: i32) {
  let aIdx = cellIndex(aX, aY);
  let bIdx = cellIndex(bX, bY);
  let a = cells[aIdx];
  cells[aIdx] = cells[bIdx] | PROCESSED;
  cells[bIdx] = a | PROCESSED;
}
