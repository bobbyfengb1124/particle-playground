// GPU twin of src/grid/rules/fire.ts; keep the two in step.
fn stepFire(x: i32, y: i32) {
  let age = incrementTimer(x, y);
  if (age >= FIRE_LIFETIME_TICKS * params.scale) {
    transformCell(x, y, MAT_EMPTY, 0u);
    return;
  }

  for (var i = 0u; i < 8u; i++) {
    let nx = x + NEIGHBORS[i].x;
    let ny = y + NEIGHBORS[i].y;
    if (!inBounds(nx, ny)) {
      continue;
    }
    let neighborId = getMat(nx, ny);
    if (neighborId == MAT_WATER) {
      transformCell(nx, ny, MAT_STEAM, 0u);
    } else if (neighborId == MAT_STEAM) {
      resetTimer(nx, ny);
    } else if (isFlammable(neighborId)) {
      transformCell(nx, ny, MAT_FIRE, 0u);
    }
  }

  let aboveY = y - 1;
  if (inBounds(x, aboveY) && getMat(x, aboveY) == MAT_EMPTY) {
    transformCell(x, aboveY, MAT_SMOKE, 0u);
  }
}
