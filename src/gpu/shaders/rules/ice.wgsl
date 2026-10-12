// GPU twin of src/grid/rules/ice.ts; keep the two in step.
fn stepIce(x: i32, y: i32, rng: ptr<function, CellRng>) {
  let belowY = y + 1;
  if (inBounds(x, belowY) && getMat(x, belowY) == MAT_EMPTY) {
    moveCell(x, y, x, belowY);
    return;
  }

  let firstDir = select(1, -1, rngBelowHalf(rng));
  let firstX = x + firstDir;
  if (inBounds(firstX, belowY) && getMat(firstX, belowY) == MAT_EMPTY) {
    moveCell(x, y, firstX, belowY);
    return;
  }

  let secondX = x - firstDir;
  if (inBounds(secondX, belowY) && getMat(secondX, belowY) == MAT_EMPTY) {
    moveCell(x, y, secondX, belowY);
    return;
  }

  // Landed: blocked straight down and both diagonals.
  for (var i = 0u; i < 8u; i++) {
    let nx = x + NEIGHBORS[i].x;
    let ny = y + NEIGHBORS[i].y;
    if (inBounds(nx, ny) && getMat(nx, ny) == MAT_FIRE) {
      transformCell(x, y, MAT_WATER, 0u);
      return;
    }
  }

  for (var i = 0u; i < 8u; i++) {
    let nx = x + NEIGHBORS[i].x;
    let ny = y + NEIGHBORS[i].y;
    if (inBounds(nx, ny) && getMat(nx, ny) == MAT_WATER) {
      transformCell(nx, ny, MAT_ICE, 0u);
    }
  }
}
