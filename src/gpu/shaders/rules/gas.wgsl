// GPU twin of src/grid/rules/gas.ts (createGasRule); keep the two in step. Smoke and steam share
// it, as in TS.
fn stepGas(x: i32, y: i32, lifetime: u32, onExpire: u32, rng: ptr<function, CellRng>) {
  let age = incrementTimer(x, y);
  if (age >= lifetime * params.scale) {
    transformCell(x, y, onExpire, 0u);
    return;
  }

  let aboveY = y - 1;
  let w = clamp(zoneWind[cellIndex(x, y)] + params.globalWind, -ZONE_WIND_MAX, ZONE_WIND_MAX);
  let threshold = windThreshold[abs(w)];
  if (threshold != 0u && nextU32(rng) < threshold) {
    let dx = x + sign(w);
    if (inBounds(dx, aboveY) && getMat(dx, aboveY) == MAT_EMPTY) {
      moveCell(x, y, dx, aboveY);
      return;
    }
    if (inBounds(dx, y) && getMat(dx, y) == MAT_EMPTY) {
      moveCell(x, y, dx, y);
      return;
    }
  }

  if (inBounds(x, aboveY) && getMat(x, aboveY) == MAT_EMPTY) {
    moveCell(x, y, x, aboveY);
    return;
  }

  let firstDir = select(1, -1, rngBelowHalf(rng));
  let dirs = array<i32, 2>(firstDir, -firstDir);
  for (var i = 0u; i < 2u; i++) {
    let dx = x + dirs[i];
    if (inBounds(dx, aboveY) && getMat(dx, aboveY) == MAT_EMPTY) {
      moveCell(x, y, dx, aboveY);
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
