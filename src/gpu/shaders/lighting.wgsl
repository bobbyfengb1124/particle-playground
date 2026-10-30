// GPU twin of LightMap.build: a fixed 4 px light map (one light cell per 4×4 px block), rebuilt each
// rendered frame. Prepended with buildPrelude() and particleTypes.wgsl.
// Order: fire → splat → resolve → (blurH → blurV) × BLUR_PASSES.

struct LightParams {
  lightWidth: u32,    // light cells across: canvas px / 4
  lightHeight: u32,
  gridWidth: u32,     // fine cells across
  cellRatio: u32,     // fine cells per light-cell side: 4 / cellSize
  frame: u32,
  particleCount: u32, // slots to scan
}

@group(0) @binding(0) var<uniform> lp: LightParams;
@group(0) @binding(1) var<storage, read> cells: array<u32>;
@group(0) @binding(2) var<storage, read> particles: array<Particle>;
@group(0) @binding(3) var<storage, read_write> accum: array<atomic<u32>>; // r, g, b per light cell, × LIGHT_FIXED_SCALE
@group(0) @binding(4) var<storage, read_write> light: array<f32>;         // r, g, b per light cell: the finished map
@group(0) @binding(5) var<storage, read_write> scratch: array<f32>;       // the blur's in-between copy

// Whole-number units per 1.0 of light. WGSL has no float atomics, so splat adds fixed-point u32s.
const LIGHT_FIXED_SCALE: f32 = 16.0;

// Twin of LightMap.ts hashToUnit; u32 `*` wraps exactly like Math.imul.
fn hashToUnit(a: u32, b: u32) -> f32 {
  var h = (a * 0x27d4eb2du) ^ (b * 0x165667b1u);
  h = (h ^ (h >> 15u)) * 0x85ebca6bu;
  h = (h ^ (h >> 13u)) * 0xc2b2ae35u;
  return f32(h ^ (h >> 16u)) / 4294967296.0;
}

// Twin of LightMap.ts flicker: value noise over `frame`, smoothstepped between hashed keyframes.
fn flicker(idx: u32, frame: u32) -> f32 {
  let keyframe = frame / FLICKER_PERIOD_FRAMES;
  let progress = f32(frame - keyframe * FLICKER_PERIOD_FRAMES) / f32(FLICKER_PERIOD_FRAMES);
  let eased = progress * progress * (3.0 - 2.0 * progress);
  let noise = hashToUnit(idx, keyframe) * (1.0 - eased) + hashToUnit(idx, keyframe + 1u) * eased;
  return FLICKER_MIN + noise * (FLICKER_MAX - FLICKER_MIN);
}

fn storeLight(i: u32, v: vec3<f32>) {
  atomicStore(&accum[i * 3u], u32(round(v.r * LIGHT_FIXED_SCALE)));
  atomicStore(&accum[i * 3u + 1u], u32(round(v.g * LIGHT_FIXED_SCALE)));
  atomicStore(&accum[i * 3u + 2u], u32(round(v.b * LIGHT_FIXED_SCALE)));
}

fn addLight(i: u32, v: vec3<f32>) {
  atomicAdd(&accum[i * 3u], u32(round(v.r * LIGHT_FIXED_SCALE)));
  atomicAdd(&accum[i * 3u + 1u], u32(round(v.g * LIGHT_FIXED_SCALE)));
  atomicAdd(&accum[i * 3u + 2u], u32(round(v.b * LIGHT_FIXED_SCALE)));
}

// One thread per light cell: counts FIRE among its fine cells. It stores rather than adds,
// so it also wipes last frame's light, with no separate clear pass. splat must run after it.
@compute @workgroup_size(8, 8)
fn fire(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= lp.lightWidth || id.y >= lp.lightHeight) { return; }
  var count = 0u;
  for (var dy = 0u; dy < lp.cellRatio; dy++) {
    for (var dx = 0u; dx < lp.cellRatio; dx++) {
      let fine = (id.y * lp.cellRatio + dy) * lp.gridWidth + id.x * lp.cellRatio + dx;
      if ((cells[fine] & MATERIAL_MASK) == MAT_FIRE) { count++; }
    }
  }
  let i = id.y * lp.lightWidth + id.x;
  let share = f32(count) / f32(lp.cellRatio * lp.cellRatio); // 1/16 per fine fire cell at 1 px
  storeLight(i, FIRE_LIGHT * (FIRE_INTENSITY * flicker(i, lp.frame) * share)); // one flicker per block
}

// One thread per particle slot: visible embers and rockets add their colour to the light cell they're in.
@compute @workgroup_size(64)
fn splat(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= lp.particleCount) { return; }
  let p = particles[id.x];
  if (!isVisible(p)) { return; }
  let kind = (p.flags >> FLAG_KIND_SHIFT) & 0xfu;
  if (kind != KIND_EMBER && kind != KIND_ROCKET) { return; }
  let lx = floor(p.x / f32(REFERENCE_CELL_SIZE));
  let ly = floor(p.y / f32(REFERENCE_CELL_SIZE));
  if (lx < 0.0 || ly < 0.0 || lx >= f32(lp.lightWidth) || ly >= f32(lp.lightHeight)) { return; }

  var lifeRatio = 1.0;
  if (p.lifespan > 0.0) { lifeRatio = p.age / p.lifespan; }
  var intensity = PARTICLE_INTENSITY * max(0.0, 1.0 - lifeRatio);
  if (kind == KIND_EMBER) {
    let densityLog2 = (p.flags >> FLAG_DENSITY_SHIFT) & 0xfu;
    intensity *= exp2(-0.5 * f32(densityLog2)); // 1/sqrt(density): denser bursts glow brighter, not washed out. Rockets stay single.
  }
  let color = vec3<f32>(f32(p.color & 0xffu), f32((p.color >> 8u) & 0xffu), f32((p.color >> 16u) & 0xffu));
  addLight(u32(ly) * lp.lightWidth + u32(lx), color * intensity);
}

// One thread per channel value: whole numbers back to decimals.
@compute @workgroup_size(64)
fn resolve(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= lp.lightWidth * lp.lightHeight * 3u) { return; }
  light[id.x] = f32(atomicLoad(&accum[id.x])) / LIGHT_FIXED_SCALE;
}

// LightMap.blur's box blur, one thread per light cell summing its 2r+1 neighbours directly (the CPU
// uses running sums: same maths, last-digit float differences). Off-map neighbours count as 0 and
// the divisor stays 2r+1, so light past the edge is lost, as on the CPU.
const BLUR_INV: f32 = 1.0 / f32(2 * BLUR_RADIUS + 1);

// Row pass: light → scratch.
@compute @workgroup_size(8, 8)
fn blurH(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= lp.lightWidth || id.y >= lp.lightHeight) { return; }
  var sum = vec3<f32>(0.0);
  for (var d = -BLUR_RADIUS; d <= BLUR_RADIUS; d++) {
    let x = i32(id.x) + d;
    if (x < 0 || x >= i32(lp.lightWidth)) { continue; }
    let j = (id.y * lp.lightWidth + u32(x)) * 3u;
    sum += vec3<f32>(light[j], light[j + 1u], light[j + 2u]);
  }
  let o = (id.y * lp.lightWidth + id.x) * 3u;
  scratch[o] = sum.r * BLUR_INV;
  scratch[o + 1u] = sum.g * BLUR_INV;
  scratch[o + 2u] = sum.b * BLUR_INV;
}

// Column pass: scratch → light.
@compute @workgroup_size(8, 8)
fn blurV(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= lp.lightWidth || id.y >= lp.lightHeight) { return; }
  var sum = vec3<f32>(0.0);
  for (var d = -BLUR_RADIUS; d <= BLUR_RADIUS; d++) {
    let y = i32(id.y) + d;
    if (y < 0 || y >= i32(lp.lightHeight)) { continue; }
    let j = (u32(y) * lp.lightWidth + id.x) * 3u;
    sum += vec3<f32>(scratch[j], scratch[j + 1u], scratch[j + 2u]);
  }
  let o = (id.y * lp.lightWidth + id.x) * 3u;
  light[o] = sum.r * BLUR_INV;
  light[o + 1u] = sum.g * BLUR_INV;
  light[o + 2u] = sum.b * BLUR_INV;
}
