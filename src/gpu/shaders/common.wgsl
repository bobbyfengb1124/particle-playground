// Shared by the compute shaders in grid.wgsl; prepended after buildPrelude().

struct Params {
  width: u32,
  height: u32,
  seed: u32,
  tick: u32,
  passIndex: u32,
  phaseX: u32,
  phaseY: u32,
}

@group(0) @binding(0) var<storage, read_write> cells: array<u32>;
@group(0) @binding(1) var<uniform> params: Params;

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
