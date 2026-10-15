// Stateless RNG helpers, shared by grid.wgsl and particles.wgsl; prepended after buildPrelude().
// Nothing here reads a Params, so any shader can include it.

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

fn nextU32(rng: ptr<function, CellRng>) -> u32 {
  let draw = hash32((*rng).base + (*rng).counter * GOLDEN);
  (*rng).counter += 1u;
  return draw;
}

// Exactly `rng.next() < 0.5` on the CPU, since next() is nextU32() / 2^32.
fn rngBelowHalf(rng: ptr<function, CellRng>) -> bool {
  return nextU32(rng) < 0x80000000u;
}
