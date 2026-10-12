// GPU twin of src/grid/rules/plant.ts; keep the two in step.

fn isLiquid(id: u32) -> bool {
  return id == MAT_WATER || id == MAT_OIL;
}

// One fall attempt into (tx, ty): move into empty space, sink through liquid. Returns whether the seed moved.
fn seedFallTo(x: i32, y: i32, tx: i32, ty: i32) -> bool {
  if (!inBounds(tx, ty)) {
    return false;
  }
  let id = getMat(tx, ty);
  if (id == MAT_EMPTY) {
    moveCell(x, y, tx, ty);
    return true;
  }
  if (isLiquid(id)) {
    swapCells(x, y, tx, ty);
    return true;
  }
  return false;
}

fn stepSeed(x: i32, y: i32, rng: ptr<function, CellRng>) {
  let belowY = y + 1;
  if (seedFallTo(x, y, x, belowY)) {
    return;
  }
  let firstFallDir = select(1, -1, rngBelowHalf(rng));
  if (seedFallTo(x, y, x + firstFallDir, belowY) || seedFallTo(x, y, x - firstFallDir, belowY)) {
    return;
  }

  // Landed: blocked straight down and both diagonals by non-liquid material.
  var waterX = -1;
  var waterY = -1;
  for (var i = 0u; i < 8u; i++) {
    let nx = x + NEIGHBORS[i].x;
    let ny = y + NEIGHBORS[i].y;
    if (inBounds(nx, ny) && getMat(nx, ny) == MAT_WATER) {
      waterX = nx;
      waterY = ny;
      break;
    }
  }
  if (waterX == -1) {
    return;
  }

  let timer = getTimer(x, y);
  let ticks = timer & 0xffu;
  let stage = timer >> 8u;
  if (ticks < WATERED_TICKS_PER_STAGE) {
    _ = incrementTimer(x, y);
    return;
  }

  let aboveY = y - 1;
  let firstGrowDir = select(1, -1, rngBelowHalf(rng));
  var targetXs = array(x, x + firstGrowDir, x - firstGrowDir);
  for (var i = 0u; i < 3u; i++) {
    let tx = targetXs[i];
    if (!inBounds(tx, aboveY) || getMat(tx, aboveY) != MAT_EMPTY) {
      continue;
    }
    transformCell(waterX, waterY, MAT_EMPTY, 0u);
    transformCell(x, y, MAT_PLANT, 0u);
    let nextStage = stage + 1u;
    if (nextStage >= MAX_STAGE * params.scale) {
      transformCell(tx, aboveY, MAT_PLANT, 0u);
    } else {
      transformCell(tx, aboveY, MAT_SEED, nextStage << 8u);
    }
    return;
  }
  // All three grow targets occupied — wait, re-checked next tick.
}
