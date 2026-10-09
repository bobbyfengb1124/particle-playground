// GPU twin of src/grid/rules/liquid.ts (createLiquidRule); keep the two in step. Water and oil share it, as in TS.
fn canSinkInto(otherId: u32, selfDensity: u32) -> bool {
  let otherDensity = density(otherId);
  return otherDensity != 0u && otherDensity < selfDensity;
}

fn stepLiquid(x: i32, y: i32, selfDensity: u32, rng: ptr<function, CellRng>) {
  let belowY = y + 1;
  if (inBounds(x, belowY)) {
    let belowId = getMat(x, belowY);
    if (belowId == MAT_EMPTY) {
      moveCell(x, y, x, belowY);
      return;
    }
    if (canSinkInto(belowId, selfDensity)) {
      swapCells(x, y, x, belowY);
      return;
    }
  }

  let firstDir = select(1, -1, rngBelowHalf(rng));
  let dirs = array<i32, 2>(firstDir, -firstDir);
  for (var i = 0u; i < 2u; i++) {
    let dx = x + dirs[i];
    if (!inBounds(dx, belowY)) {
      continue;
    }
    let diagId = getMat(dx, belowY);
    if (diagId == MAT_EMPTY) {
      moveCell(x, y, dx, belowY);
      return;
    }
    if (canSinkInto(diagId, selfDensity)) {
      swapCells(x, y, dx, belowY);
      return;
    }
  }

  let firstX = x + firstDir;
  if (inBounds(firstX, y) && getMat(firstX, y) == MAT_EMPTY) {
    moveCell(x, y, firstX, y);
    return;
  }

  let secondX = x - firstDir;
  if (inBounds(secondX, y) && getMat(secondX, y) == MAT_EMPTY) {
    moveCell(x, y, secondX, y);
  }
}
