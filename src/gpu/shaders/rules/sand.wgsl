// GPU twin of src/grid/rules/sand.ts; keep the two in step.
fn stepSand(x: i32, y: i32, rng: ptr<function, CellRng>) {
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
  }
}
