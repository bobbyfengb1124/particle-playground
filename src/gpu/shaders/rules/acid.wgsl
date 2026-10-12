// GPU twin of src/grid/rules/acid.ts; keep the two in step.
fn stepAcid(x: i32, y: i32, rng: ptr<function, CellRng>) {
  for (var i = 0u; i < 8u; i++) {
    let n = vec2(x, y) + NEIGHBORS[i];
    if (!inBounds(n.x, n.y)) {
      continue;
    }
    let neighborId = getMat(n.x, n.y);
    if (neighborId == MAT_EMPTY || neighborId == MAT_STONE || neighborId == MAT_ACID) {
      continue;
    }
    transformCell(n.x, n.y, MAT_EMPTY, 0u);
    transformCell(x, y, MAT_EMPTY, 0u);
    return;
  }
  stepLiquid(x, y, density(MAT_ACID), rng);
}
