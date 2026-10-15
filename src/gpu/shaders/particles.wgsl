// Particle state, free slots and spawn requests for GpuParticles; prepended with buildPrelude(), rng.wgsl and particleTypes.wgsl.

struct Counters {
  freeTop: atomic<u32>,      // slots on the free stack; alive particles = capacity - freeTop
  requestCount: atomic<u32>, // requests in `requests` this tick (CPU-uploaded first, then GPU-appended)
}

// One spawn request (32 bytes, Q3): the emit pass turns it into `count` particles.
struct Request {
  x: f32, y: f32, vx: f32, vy: f32,
  flags: u32, // same layout as Particle.flags; kind says what to spawn
  count: u32,
  speed: f32, // EMBER requests: the ring's base speed, px/s (burst 130, crossette split 78). 0 from the CPU.
  _pad1: u32,
}

struct ParticleParams {
  capacity: u32,
  seed: u32,
  tick: u32,
  gridWidth: u32,    // cells
  gridHeight: u32,
  cellSize: u32,     // px per cell
  dt: f32,           // seconds
  gravity: f32,      // px/s²
  globalWind: f32,   // px/s², the wind slider
  width: f32,        // canvas px, for bounds
  height: f32,
}

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<storage, read_write> freeStack: array<u32>;
@group(0) @binding(2) var<storage, read_write> counters: Counters;
@group(0) @binding(3) var<storage, read_write> requests: array<Request>;
@group(0) @binding(4) var<uniform> pparams: ParticleParams;
@group(0) @binding(5) var<storage, read> zoneWind: array<i32>; // GpuGrid's buffer (Q6)
@group(0) @binding(6) var<storage, read_write> cells: array<u32>; // GpuGrid's packed cells (layout in prelude.ts); ignite writes FIRE

const TAU: f32 = 6.2831853;

// [0, 1) from the top 24 bits of a draw: exact in f32, so it can never round up to 1.0.
fn rand01(rng: ptr<function, CellRng>) -> f32 {
  return f32(nextU32(rng) >> 8u) / 16777216.0;
}

// Same arithmetic as range() in src/core/Rng.ts.
fn randRange(rng: ptr<function, CellRng>, lo: f32, hi: f32) -> f32 {
  return lo + rand01(rng) * (hi - lo);
}

// Takes one slot off the free stack; false when it's empty (the spawn is refused, as in ParticleSystem.spawn).
fn popFreeSlot(slot: ptr<function, u32>) -> bool {
  let old = atomicSub(&counters.freeTop, 1u);
  if (old == 0u || old > pparams.capacity) {
    atomicAdd(&counters.freeTop, 1u); // the stack was empty and the subtract wrapped below 0: undo it
    return false;
  }
  *slot = freeStack[old - 1u];
  return true;
}

// Mirrors CpuBackend.spawnParticlesAt: the same four draws in the same order, the same ranges.
fn spawnGeneric(req: Request, rng: ptr<function, CellRng>) -> Particle {
  let angle = randRange(rng, 0.0, TAU);
  let speed = randRange(rng, 10.0, 60.0);
  var p: Particle; // WGSL zero-fills a var with no initialiser
  p.x = req.x;
  p.y = req.y;
  p.vx = cos(angle) * speed;
  p.vy = sin(angle) * speed;
  p.radius = randRange(rng, 1.5, 3.5);
  p.lifespan = randRange(rng, 1.0, 2.0);
  p.dragCoef = 0.8; // CpuBackend's DEFAULT_DRAG_COEF
  p.restitution = 0.6; // Particle.ts default
  p.gravityScale = 1.0;
  p.color = 0xFFFFFFu; // white, the Particle.ts default
  p.flags = FLAG_ALIVE; // kind GENERIC = 0
  return p;
}

// Mirrors launchRocket (fireworks.ts): the colour's swatch, with pattern and colour kept in flags for the apex burst.
fn spawnRocket(req: Request) -> Particle {
  var p: Particle;
  p.x = req.x;
  p.y = req.y;
  p.vx = req.vx;
  p.vy = req.vy;
  p.radius = 3.0;
  p.lifespan = 12.0; // generous cap; the apex removes the rocket long before this
  p.dragCoef = 0.0;
  p.restitution = 0.6; // Particle.ts default
  p.gravityScale = 1.0;
  p.color = colorPreset((req.flags >> FLAG_COLOR_SHIFT) & 0xfu).swatch;
  p.flags = req.flags | FLAG_ALIVE;
  return p;
}

// Mirrors spawnEmberRing (fireworks.ts) for one ember of a burst: ember `i` of `req.count` sits at its share of
// the circle, with the same draws in the same order: angle jitter, speed, radius, two colour draws, lifespan.
fn spawnEmber(req: Request, i: u32, rng: ptr<function, CellRng>) -> Particle {
  // burst() in fireworks.ts: what each pattern means for its embers.
  let pattern = (req.flags >> FLAG_BEHAVIOR_SHIFT) & 0xfu;
  var behavior = EMBER_NONE;
  var dragCoef = EMBER_BASE_DRAG;
  var gravityScale = 1.0;
  if (pattern == PATTERN_WILLOW) {
    dragCoef = EMBER_BASE_DRAG * WILLOW_DRAG_MULTIPLIER;
    gravityScale = WILLOW_GRAVITY_SCALE;
  } else if (pattern == PATTERN_CROSSETTE) {
    behavior = EMBER_CROSSETTE;
  } else if (pattern == PATTERN_STROBE) {
    behavior = EMBER_STROBE;
  }

  let angle = f32(i) / f32(req.count) * TAU + randRange(rng, -0.05, 0.05);
  let speed = req.speed * randRange(rng, 0.85, 1.15);
  var p: Particle;
  p.x = req.x;
  p.y = req.y;
  p.vx = req.vx + cos(angle) * speed;
  p.vy = req.vy + sin(angle) * speed;
  p.radius = randRange(rng, 1.2, 2.2);

  // Two colour draws: R and G share t1, B uses t2 (FIREWORK_COLOR_PRESETS' rule). floor(+0.5) is Math.round.
  let preset = colorPreset((req.flags >> FLAG_COLOR_SHIFT) & 0xfu);
  let t1 = rand01(rng);
  let t2 = rand01(rng);
  let r = u32(floor(preset.rLo + t1 * (preset.rHi - preset.rLo) + 0.5));
  let g = u32(floor(preset.gLo + t1 * (preset.gHi - preset.gLo) + 0.5));
  let b = u32(floor(preset.bLo + t2 * (preset.bHi - preset.bLo) + 0.5));
  p.color = r | (g << 8u) | (b << 16u);

  p.lifespan = randRange(rng, EMBER_LIFESPAN * 0.8, EMBER_LIFESPAN * 1.2);
  p.dragCoef = dragCoef;
  p.restitution = 0.35;
  p.gravityScale = gravityScale;
  // Colour and density stay from the request (a crossette split reuses them, Q11); kind and behaviour are the ember's own.
  p.flags = (req.flags & ~0xffu) | KIND_EMBER | (behavior << FLAG_BEHAVIOR_SHIFT) | FLAG_ALIVE;
  if (behavior == EMBER_STROBE) {
    p.behaviorTimer = STROBE_FLICKER_PERIOD;
    p.flags |= FLAG_BEHAVIOR_FLAG; // starts in its visible phase
  }
  return p;
}

// One 64-thread workgroup per request (Q1); dispatched indirectly with requestCount groups (Q4).
@compute @workgroup_size(64)
fn emit(@builtin(workgroup_id) group: vec3<u32>, @builtin(local_invocation_index) lane: u32) {
  let r = group.x;
  let req = requests[r];
  for (var i = lane; i < req.count; i += 64u) {
    var slot: u32;
    if (!popFreeSlot(&slot)) { return; }
    // Keyed by (seed, tick, request, particle index), never by slot (Q2).
    var rng = CellRng(hash32(pparams.seed ^ hash32(pparams.tick ^ hash32(r ^ hash32(i)))), 0u);
    let kind = (req.flags >> FLAG_KIND_SHIFT) & 0xfu;
    if (kind == KIND_ROCKET) {
      particles[slot] = spawnRocket(req);
    } else if (kind == KIND_EMBER) {
      particles[slot] = spawnEmber(req, i, &rng);
    } else {
      particles[slot] = spawnGeneric(req, &rng);
    }
  }
}

// Frees a particle's slot. Only the thread that owns `slot` calls this, so each slot is pushed at most once.
fn releaseSlot(slot: u32) {
  particles[slot].flags = 0u; // ALIVE cleared: every pass now skips it
  let top = atomicAdd(&counters.freeTop, 1u);
  freeStack[top] = slot;
}

// Adds a spawn request for this tick's emit pass (Q1). Past the buffer's capacity it's dropped, like a refused spawn (Q3).
fn appendRequest(req: Request) {
  let r = atomicAdd(&counters.requestCount, 1u);
  if (r < arrayLength(&requests)) { requests[r] = req; }
}

// WindField.atPixel: the zone wind of the cell under (x, y), 0 off the grid.
fn zoneWindAt(x: f32, y: f32) -> f32 {
  let gx = i32(floor(x / f32(pparams.cellSize)));
  let gy = i32(floor(y / f32(pparams.cellSize)));
  if (gx < 0 || gy < 0 || gx >= i32(pparams.gridWidth) || gy >= i32(pparams.gridHeight)) { return 0.0; }
  return f32(zoneWind[u32(gy) * pparams.gridWidth + u32(gx)]);
}

// Twin of applyBoundsCollision (collisions.ts).
fn bounce(p: ptr<function, Particle>) {
  if ((*p).x - (*p).radius < 0.0) {
    (*p).x = (*p).radius;
    (*p).vx = -(*p).vx * (*p).restitution;
  } else if ((*p).x + (*p).radius > pparams.width) {
    (*p).x = pparams.width - (*p).radius;
    (*p).vx = -(*p).vx * (*p).restitution;
  }
  if ((*p).y - (*p).radius < 0.0) {
    (*p).y = (*p).radius;
    (*p).vy = -(*p).vy * (*p).restitution;
  } else if ((*p).y + (*p).radius > pparams.height) {
    (*p).y = pparams.height - (*p).radius;
    (*p).vy = -(*p).vy * (*p).restitution;
  }
}

// Twin of ParticleSystem.update for one slot: forces, integrate, bounds, age, release when expired.
@compute @workgroup_size(64)
fn update(@builtin(global_invocation_id) id: vec3<u32>) {
  let slot = id.x;
  if (slot >= pparams.capacity) { return; }
  var p = particles[slot];
  if ((p.flags & FLAG_ALIVE) == 0u) { return; }

  // forces.ts, in the same order: gravity, global wind, zone wind, drag.
  let ax = pparams.globalWind + zoneWindAt(p.x, p.y) - p.vx * p.dragCoef;
  let ay = pparams.gravity * p.gravityScale - p.vy * p.dragCoef;
  p.vx += ax * pparams.dt;
  p.vy += ay * pparams.dt;
  p.x += p.vx * pparams.dt;
  p.y += p.vy * pparams.dt;
  bounce(&p);
  p.age += pparams.dt;

  if (p.age >= p.lifespan) {
    releaseSlot(slot);
    return;
  }

  // updateFireworkBehaviors: a rocket that has stopped rising bursts at its apex and is removed.
  let kind = (p.flags >> FLAG_KIND_SHIFT) & 0xfu;
  if (kind == KIND_ROCKET && p.vy >= 0.0) {
    let density = (p.flags >> FLAG_DENSITY_SHIFT) & 0xfu; // log2 of the burst density, 0 = 1× (Q11)
    var burst: Request;
    burst.x = p.x;
    burst.y = p.y;
    burst.flags = (p.flags & ~(FLAG_ALIVE | 0xfu)) | KIND_EMBER; // keep pattern, colour and density; kind becomes EMBER
    burst.count = EMBER_COUNT << density;
    burst.speed = EMBER_BASE_SPEED;
    appendRequest(burst);
    releaseSlot(slot);
    return;
  }

  // updateFireworkBehaviors: strobe flicker and the crossette's one-shot split.
  if (kind == KIND_EMBER) {
    let behavior = (p.flags >> FLAG_BEHAVIOR_SHIFT) & 0xfu;
    if (behavior == EMBER_STROBE) {
      p.behaviorTimer -= pparams.dt;
      if (p.behaviorTimer <= 0.0) {
        p.flags ^= FLAG_BEHAVIOR_FLAG; // flip visible <-> invisible
        p.behaviorTimer += STROBE_FLICKER_PERIOD;
      }
    } else if (behavior == EMBER_CROSSETTE && (p.flags & FLAG_BEHAVIOR_FLAG) == 0u
               && p.age >= p.lifespan * CROSSETTE_SPLIT_FRACTION) {
      p.flags |= FLAG_BEHAVIOR_FLAG; // one-shot guard: an ember only ever splits once
      let density = (p.flags >> FLAG_DENSITY_SHIFT) & 0xfu;
      var split: Request;
      split.x = p.x;
      split.y = p.y;
      split.vx = p.vx; // the small ring travels on with its parent
      split.vy = p.vy;
      // Keep colour and density; kind EMBER, pattern RING (so its embers have no behaviour), split bit cleared.
      split.flags = (p.flags & ~(FLAG_ALIVE | FLAG_BEHAVIOR_FLAG | 0xffu)) | KIND_EMBER | (PATTERN_RING << FLAG_BEHAVIOR_SHIFT);
      split.count = CROSSETTE_SUB_EMBER_COUNT << density;
      split.speed = EMBER_BASE_SPEED * 0.6;
      appendRequest(split);
    }
  }
  particles[slot] = p;
}

// Twin of CpuBackend.igniteEmbersOnLanding for one slot: an ember whose centre is inside a non-empty cell is used up,
// and every flammable cell in its 4×4 px block catches fire (one cell at cellSize 4, the CPU's case).
@compute @workgroup_size(64)
fn ignite(@builtin(global_invocation_id) id: vec3<u32>) {
  let slot = id.x;
  if (slot >= pparams.capacity) { return; }
  let p = particles[slot];
  if ((p.flags & FLAG_ALIVE) == 0u) { return; }
  if (((p.flags >> FLAG_KIND_SHIFT) & 0xfu) != KIND_EMBER) { return; }

  let gx = i32(floor(p.x / f32(pparams.cellSize)));
  let gy = i32(floor(p.y / f32(pparams.cellSize)));
  if (gx < 0 || gy < 0 || gx >= i32(pparams.gridWidth) || gy >= i32(pparams.gridHeight)) { return; }
  if ((cells[u32(gy) * pparams.gridWidth + u32(gx)] & MATERIAL_MASK) == MAT_EMPTY) { return; } // still in the air

  // The 4×4 px block on the 4 px lattice, measured in cells.
  let perBlock = max(1u, REFERENCE_CELL_SIZE / pparams.cellSize); // cells per block side: 4 at cellSize 1, 1 at cellSize 4
  let startX = (u32(gx) / perBlock) * perBlock;
  let startY = (u32(gy) / perBlock) * perBlock;
  for (var dy = 0u; dy < perBlock; dy++) {
    for (var dx = 0u; dx < perBlock; dx++) {
      let x = startX + dx;
      let y = startY + dy;
      if (x >= pparams.gridWidth || y >= pparams.gridHeight) { continue; }
      let idx = y * pparams.gridWidth + x;
      if (isFlammable(cells[idx] & MATERIAL_MASK)) {
        cells[idx] = MAT_FIRE; // timer 0, as transformMaterial(x, y, FIRE, 0)
      }
    }
  }
  releaseSlot(slot); // used up whether or not anything caught fire
}

// The emit pass's dispatch size (Q4). Its own group: a buffer can't be writable storage and the
// indirect-args source in the same dispatch, so emit's group 0 must not contain it.
@group(1) @binding(0) var<storage, read_write> emitArgs: array<u32, 3>;

@compute @workgroup_size(1)
fn writeEmitArgs() {
  // arrayLength(&requests) is the buffer's request capacity (4,096, Q3): requests past it were dropped.
  emitArgs[0] = min(atomicLoad(&counters.requestCount), arrayLength(&requests));
  emitArgs[1] = 1u;
  emitArgs[2] = 1u;
}
