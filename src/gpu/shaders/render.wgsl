// Draws the cell buffer onto #scene: one triangle covering the canvas, and each pixel
// looks up its cell's colour. Twin of GridRenderer's no-lighting branch: EMPTY is
// transparent, so #scene's black CSS background shows through.

struct RenderParams {
  width: u32,
  height: u32,
  cellSize: u32,
}

@group(0) @binding(0) var<storage, read> cells: array<u32>;
@group(0) @binding(1) var<uniform> params: RenderParams;
@group(0) @binding(2) var<storage, read> palette: array<vec4<f32>>;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  var corners = array<vec2<f32>, 3>(vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  return vec4(corners[i], 0.0, 1.0);
}

@fragment
fn fs(@builtin(position) pixel: vec4<f32>) -> @location(0) vec4<f32> {
  let x = u32(pixel.x) / params.cellSize;
  let y = u32(pixel.y) / params.cellSize;
  if (x >= params.width || y >= params.height) {
    return vec4(0.0);
  }
  return palette[cells[y * params.width + x] & MATERIAL_MASK];
}
