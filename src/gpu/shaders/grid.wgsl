// Entry points for GpuGrid; prepended with buildPrelude(), common.wgsl and the rules/*.wgsl files.

// One brush stamp as a square of fine cells, computed in TS exactly as CpuBackend.paintBrush's loop bounds.
struct Stamp {
  x0: i32,
  y0: i32,
  side: u32,
  material: u32,
}

@group(0) @binding(2) var<storage, read> stamps: array<Stamp>;

// Twin of the processed-flag reset in Grid.beginTick. 2-D so a 4K grid stays under the 65,535 workgroups-per-dimension limit.
@compute @workgroup_size(8, 8)
fn clearProcessed(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= params.width || id.y >= params.height) {
    return;
  }
  let idx = id.y * params.width + id.x;
  cells[idx] = cells[idx] & ~PROCESSED;
}

// Twin of one pass of PhasedStepper.step: thread (i, j) visits cell (phaseX + 3i, phaseY + 3j).
@compute @workgroup_size(8, 8)
fn stepPass(@builtin(global_invocation_id) id: vec3<u32>) {
  let ux = params.phaseX + 3u * id.x;
  let uy = params.phaseY + 3u * id.y;
  if (ux >= params.width || uy >= params.height) {
    return;
  }
  let x = i32(ux);
  let y = i32(uy);
  let idx = uy * params.width + ux;
  let cell = cells[idx];
  if ((cell & PROCESSED) != 0u) {
    return;
  }
  let mat = cell & MATERIAL_MASK;
  if (mat == MAT_EMPTY) {
    return;
  }
  var rng = cellRng(idx);
  switch mat {
    case MAT_SAND: {
      stepSand(x, y, &rng);
    }
    case MAT_WATER, MAT_OIL: {
      stepLiquid(x, y, density(mat), &rng);
    }
    default: {}
  }
}

// Twin of CpuBackend.paintBrush → Grid.setMaterial: thread (i, j, s) paints fine cell (x0 + i, y0 + j) of stamp s; timer resets to 0.
@compute @workgroup_size(8, 8)
fn paint(@builtin(global_invocation_id) id: vec3<u32>) {
  let stamp = stamps[id.z];
  if (id.x >= stamp.side || id.y >= stamp.side) {
    return;
  }
  let x = stamp.x0 + i32(id.x);
  let y = stamp.y0 + i32(id.y);
  if (!inBounds(x, y)) {
    return;
  }
  cells[cellIndex(x, y)] = stamp.material;
}
