// Draws the cell buffer onto #scene: one triangle covering the canvas, and each pixel
// looks up its cell's colour. Twin of GridRenderer: EMPTY is transparent, so #scene's
// black CSS background shows through, and with Lighting on each cell goes through
// shadeCell's tint/halo using the GpuLighting map.

struct RenderParams {
  width: u32,
  height: u32,
  cellSize: u32,
  lit: u32,         // the Lighting checkbox
  lightWidth: u32,  // light cells across (GpuLighting)
  lightHeight: u32,
}

@group(0) @binding(0) var<storage, read> cells: array<u32>;
@group(0) @binding(1) var<uniform> params: RenderParams;
@group(0) @binding(2) var<storage, read> palette: array<vec4<f32>>;
@group(0) @binding(3) var<storage, read> light: array<f32>; // r, g, b per light cell

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  var corners = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  return vec4(corners[i], 0.0, 1.0);
}

// One light cell, clamped to the map edge.
fn lightAt(lx: i32, ly: i32) -> vec3<f32> {
  let x = u32(clamp(lx, 0, i32(params.lightWidth) - 1));
  let y = u32(clamp(ly, 0, i32(params.lightHeight) - 1));
  let j = (y * params.lightWidth + x) * 3u;
  return vec3(light[j], light[j + 1u], light[j + 2u]);
}

// Bilinear blend of the 4 nearest light-cell centres around canvas point `p`.
fn sampleLight(p: vec2<f32>) -> vec3<f32> {
  let q = p / f32(REFERENCE_CELL_SIZE) - 0.5;
  let base = vec2<i32>(floor(q));
  let t = fract(q);
  let top = mix(lightAt(base.x, base.y), lightAt(base.x + 1, base.y), t.x);
  let bottom = mix(lightAt(base.x, base.y + 1), lightAt(base.x + 1, base.y + 1), t.x);
  return mix(top, bottom, t.y);
}

@fragment
fn fs(@builtin(position) pixel: vec4<f32>) -> @location(0) vec4<f32> {
  let x = u32(pixel.x) / params.cellSize;
  let y = u32(pixel.y) / params.cellSize;
  if (x >= params.width || y >= params.height) {
    return vec4(0.0);
  }
  let mat = cells[y * params.width + x] & MATERIAL_MASK;
  let base = palette[mat];
  if (params.lit == 0u) {
    return base;
  }

  // Read at the cell's centre, so each cell stays one flat colour; at 4 px that's exactly one light cell, as on the CPU.
  let l = sampleLight((vec2<f32>(f32(x), f32(y)) + 0.5) * f32(params.cellSize));
  if (mat != MAT_EMPTY) {
    return vec4(min(vec3(1.0), base.rgb + l * (LIT_GAIN / 255.0)), 1.0);
  }
  let peak = max(l.r, max(l.g, l.b));
  if (peak <= 0.0) {
    return vec4(0.0);
  }
  let a = min(HALO_MAX_ALPHA, peak * HALO_GAIN) / 255.0;
  return vec4(l / peak * a, a); // the canvas is premultiplied; shadeCell's ImageData isn't
}
