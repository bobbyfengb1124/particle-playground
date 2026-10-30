// Draws GpuParticles' slots onto #scene, over the cells: one small square per slot,
// shaded as a soft-edged circle. Twin of ParticleRenderer. Prepended with buildPrelude() and particleTypes.wgsl.

struct DrawParams {
  width: f32,  // canvas px
  height: f32,
}

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> dparams: DrawParams;

// What the vertex shader hands to the fragment shader for each corner of the square.
struct Corner {
  @builtin(position) position: vec4<f32>,
  @location(0) offsetX: f32,     // px from the particle's centre; the edge test uses it
  @location(1) offsetY: f32,
  @location(2) radius: f32,
  @location(3) color: vec4<f32>, // already multiplied by alpha
}

@vertex
fn vs(@builtin(vertex_index) corner: u32, @builtin(instance_index) slot: u32) -> Corner {
  var out: Corner;
  let p = particles[slot];
  if (!isVisible(p)) {
    out.position = vec4(2.0, 2.0, 0.0, 1.0); // off-screen: all 6 corners land on one point, so nothing is drawn
    return out;
  }
  // Two triangles make the square: 6 corners, each at -1 or 1 on each side.
  var cornersX = array<f32, 6>(-1.0, 1.0, -1.0, -1.0, 1.0, 1.0);
  var cornersY = array<f32, 6>(-1.0, -1.0, 1.0, 1.0, -1.0, 1.0);
  let half = p.radius + 0.5; // the soft edge reaches 0.5 px past the radius, so the square must too
  out.offsetX = cornersX[corner] * half;
  out.offsetY = cornersY[corner] * half;
  out.radius = p.radius;

  let px = p.x + out.offsetX;
  let py = p.y + out.offsetY;
  out.position = vec4(px / dparams.width * 2.0 - 1.0, 1.0 - py / dparams.height * 2.0, 0.0, 1.0);

  var lifeRatio = 1.0;
  if (p.lifespan > 0.0) { lifeRatio = p.age / p.lifespan; }
  let alpha = max(0.0, 1.0 - lifeRatio);
  let r = f32(p.color & 0xffu) / 255.0;
  let g = f32((p.color >> 8u) & 0xffu) / 255.0;
  let b = f32((p.color >> 16u) & 0xffu) / 255.0;
  out.color = vec4(r * alpha, g * alpha, b * alpha, alpha);
  return out;
}

@fragment
fn fs(in: Corner) -> @location(0) vec4<f32> {
  let dist = sqrt(in.offsetX * in.offsetX + in.offsetY * in.offsetY);
  let coverage = clamp(in.radius - dist + 0.5, 0.0, 1.0); // Q7: 1 inside, 0 outside, a 1 px fade across the edge
  return in.color * coverage;
}
