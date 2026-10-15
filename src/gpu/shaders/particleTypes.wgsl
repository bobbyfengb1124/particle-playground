// The particle slot layout, shared by particles.wgsl (simulation) and particleDraw.wgsl (drawing).

// One particle slot: the GPU twin of Particle.ts (ax/ay only exist inside the update, so they're locals there).
struct Particle {
  x: f32, y: f32, vx: f32, vy: f32,
  age: f32, lifespan: f32, radius: f32, dragCoef: f32,
  restitution: f32, gravityScale: f32, behaviorTimer: f32,
  color: u32, // R | G << 8 | B << 16, each 0..255
  flags: u32, // see the FLAG_ constants
}

// flags layout. A slot whose ALIVE bit is clear is free and skipped by every pass.
const FLAG_KIND_SHIFT: u32 = 0u;      // ParticleKind, bits 0-3
const FLAG_BEHAVIOR_SHIFT: u32 = 4u;  // EmberBehavior, or a rocket's FireworkPattern, bits 4-7
const FLAG_BEHAVIOR_FLAG: u32 = 1u << 8u; // strobe visible / crossette already split
const FLAG_COLOR_SHIFT: u32 = 12u;    // FireworkColor, bits 12-15
const FLAG_DENSITY_SHIFT: u32 = 16u;  // log2(burst density) 0..6, bits 16-19
const FLAG_ALIVE: u32 = 1u << 31u;
