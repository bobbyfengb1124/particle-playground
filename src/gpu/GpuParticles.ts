import { compileShader } from "./GpuContext";
import type { GpuGrid } from "./GpuGrid";
import type { GpuTimer } from "./GpuTimer";
import { buildPrelude } from "./shaders/prelude";
import rngWgsl from "./shaders/rng.wgsl?raw";
import particleTypesWgsl from "./shaders/particleTypes.wgsl?raw";
import particlesWgsl from "./shaders/particles.wgsl?raw";

/** Struct sizes in particleTypes.wgsl (Particle) and particles.wgsl (Request). */
const PARTICLE_BYTES = 52;
const REQUEST_BYTES = 32;
/** 11 four-byte fields in ParticleParams, rounded up to a multiple of 16 as uniforms require. */
const PARAMS_BYTES = 48;
/** Spawn requests per tick (Q3); writeEmitArgs reads this back via arrayLength. */
export const MAX_REQUESTS = 4096;
/** Alive-count readback every this many ticks: ~250 ms at 60 ticks/s (Q8). Counted in ticks because tick() never reads the clock. */
const ALIVE_READ_INTERVAL = 15;

/** One spawn request; mirrors `struct Request` in particles.wgsl. */
export interface ParticleRequest {
  x: number;
  y: number;
  vx: number;
  vy: number;
  flags: number; // Particle.flags layout; kind GENERIC (0) for spawnParticlesAt
  count: number;
}

/** Particle.flags for a request; the shifts mirror the FLAG_*_SHIFT constants in particleTypes.wgsl. */
export function packFlags(kind: number, behavior: number, color: number, densityLog2: number): number {
  return kind | (behavior << 4) | (color << 12) | (densityLog2 << 16);
}

/** Particle.flags' ALIVE bit (FLAG_ALIVE in particleTypes.wgsl). */
const FLAG_ALIVE = 0x80000000;

/** One alive slot as read back by readback(), with the fields the tests check. */
export interface ParticleSnapshot {
  slot: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  lifespan: number;
  radius: number;
  color: number;
  flags: number;
}

export interface GpuParticlesOptions {
  capacity: number; // slots: 262,144 in the app, small in tests (Q13)
  seed: number;
  cellSize: number; // px per grid cell
  width: number; // canvas px
  height: number;
  gravity: number; // px/s²
  timer?: GpuTimer; // times the tick pass as "sim"; the app passes one, tests don't
}

/** The GPU twin of ParticleSystem: particle slots, a free stack and spawn requests, stepped by particles.wgsl. */
export class GpuParticles {
  private constructor(
    private readonly device: GPUDevice,
    private readonly opts: GpuParticlesOptions,
    private readonly grid: GpuGrid,
    private readonly buffers: ReturnType<typeof createBuffers>,
    private readonly pipelines: {
      update: GPUComputePipeline;
      emit: GPUComputePipeline;
      writeEmitArgs: GPUComputePipeline;
      ignite: GPUComputePipeline;
    },
    private readonly mainGroup: GPUBindGroup,
    private readonly argsGroup: GPUBindGroup,
  ) {}

  private pending: ParticleRequest[] = [];
  private tickCount = 0;
  private alive = 0;
  private aliveReadPending = false;

  /** Alive particles as of the last readback (Q8): up to ~250 ms old, 0 until the first one lands. */
  get aliveCount(): number {
    return this.alive;
  }

  /** The slot buffer, for GpuRenderer's particle draw (read-only there). */
  get stateBuffer(): GPUBuffer {
    return this.buffers.particles;
  }

  get capacity(): number {
    return this.opts.capacity;
  }

  /** Queued for the next tick's emit pass. Past MAX_REQUESTS in one tick they're dropped, like a refused spawn (Q3). */
  request(r: ParticleRequest): void {
    if (this.pending.length < MAX_REQUESTS) this.pending.push(r);
  }

  /** One sim tick, in Q5's order: update (forces, bounds, age, release), then emit this tick's requests, then ignite (embers landing on cells). */
  tick(dt: number, globalWind: number): void {
    const { device, buffers } = this;
    this.uploadRequests();
    device.queue.writeBuffer(buffers.params, 0, this.paramsData(dt, globalWind));

    const encoder = device.createCommandEncoder({ label: "particles.tick" });
    const compute = encoder.beginComputePass({ label: "particles.tick", timestampWrites: this.opts.timer?.writes("sim") });
    compute.setBindGroup(0, this.mainGroup);
    compute.setPipeline(this.pipelines.update);
    compute.dispatchWorkgroups(Math.ceil(this.opts.capacity / 64));
    compute.setPipeline(this.pipelines.writeEmitArgs);
    compute.setBindGroup(1, this.argsGroup);
    compute.dispatchWorkgroups(1);
    compute.setPipeline(this.pipelines.emit);
    compute.dispatchWorkgroupsIndirect(buffers.emitArgs, 0);
    compute.setPipeline(this.pipelines.ignite);
    compute.dispatchWorkgroups(Math.ceil(this.opts.capacity / 64));
    compute.end();

    const readAlive = this.tickCount % ALIVE_READ_INTERVAL === 0 && !this.aliveReadPending;
    if (readAlive) encoder.copyBufferToBuffer(buffers.counters, 0, buffers.aliveRead, 0, 4); // freeTop
    device.queue.submit([encoder.finish()]);
    if (readAlive) this.readAlive();
    this.tickCount++;
  }

  /** Frees the particle buffers; zoneWind belongs to GpuGrid. The device belongs to the caller. */
  destroy(): void {
    for (const b of Object.values(this.buffers)) b.destroy();
  }

  /** Every alive slot, the free stack and freeTop, read back to the CPU. Waits on the GPU: tests only, never per frame. */
  async readback(): Promise<{ alive: ParticleSnapshot[]; free: Uint32Array; freeTop: number }> {
    const { capacity } = this.opts;
    const state = await this.copyOut(this.buffers.particles);
    const stack = new Uint32Array(await this.copyOut(this.buffers.freeStack));
    const freeTop = new Uint32Array(await this.copyOut(this.buffers.counters))[0];

    // Field positions follow struct Particle: x 0, y 1, vx 2, vy 3, age 4, lifespan 5, radius 6, color 11, flags 12.
    const f32 = new Float32Array(state);
    const u32 = new Uint32Array(state);
    const alive: ParticleSnapshot[] = [];
    for (let slot = 0; slot < capacity; slot++) {
      const w = slot * (PARTICLE_BYTES / 4); // this slot's first word
      const flags = u32[w + 12];
      if ((flags & FLAG_ALIVE) === 0) continue;
      alive.push({ slot, x: f32[w], y: f32[w + 1], vx: f32[w + 2], vy: f32[w + 3], age: f32[w + 4], lifespan: f32[w + 5], radius: f32[w + 6], color: u32[w + 11], flags });
    }
    return { alive, free: stack.slice(0, Math.min(freeTop, capacity)), freeTop };
  }

  /** Copies a whole GPU buffer into a fresh ArrayBuffer (the GpuGrid.readback recipe). */
  private async copyOut(src: GPUBuffer): Promise<ArrayBuffer> {
    const staging = this.device.createBuffer({
      label: "particles.readback",
      size: src.size,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    const encoder = this.device.createCommandEncoder({ label: "particles.readback" });
    encoder.copyBufferToBuffer(src, 0, staging, 0, src.size);
    this.device.queue.submit([encoder.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const data = staging.getMappedRange().slice(0);
    staging.unmap();
    staging.destroy();
    return data;
  }

  /** Writes the queued requests to the front of the request buffer and sets requestCount to match. */
  private uploadRequests(): void {
    const reqs = this.pending;
    this.pending = [];
    if (reqs.length > 0) {
      const data = new ArrayBuffer(reqs.length * REQUEST_BYTES);
      const f32 = new Float32Array(data);
      const u32 = new Uint32Array(data);
      reqs.forEach((r, i) => {
        f32.set([r.x, r.y, r.vx, r.vy], i * 8);
        u32.set([r.flags, r.count], i * 8 + 4);
      });
      this.device.queue.writeBuffer(this.buffers.requests, 0, data);
    }
    // requestCount sits at byte 4 of counters. GPU-made requests (appendRequest in particles.wgsl) go after these.
    this.device.queue.writeBuffer(this.buffers.counters, 4, new Uint32Array([reqs.length]));
  }

  /** ParticleParams, laid out as in particles.wgsl: six u32s, then five f32s. */
  private paramsData(dt: number, globalWind: number): ArrayBuffer {
    const { capacity, seed, cellSize, width, height, gravity } = this.opts;
    const data = new ArrayBuffer(PARAMS_BYTES);
    new Uint32Array(data, 0, 6).set([capacity, seed, this.tickCount, this.grid.width, this.grid.height, cellSize]);
    new Float32Array(data, 24, 5).set([dt, gravity, globalWind, width, height]);
    return data;
  }

  /** Maps the freeTop copy and caches capacity - freeTop. One map at a time; a tick that finds one pending just skips its read. */
  private readAlive(): void {
    this.aliveReadPending = true;
    const staging = this.buffers.aliveRead;
    staging
      .mapAsync(GPUMapMode.READ)
      .then(() => {
        const freeTop = new Uint32Array(staging.getMappedRange())[0];
        staging.unmap();
        this.alive = this.opts.capacity - freeTop;
      })
      .catch(() => {}) // only rejects on device loss or destroy(); the device-lost banner already reports it
      .finally(() => {
        this.aliveReadPending = false;
      });
  }

  static async create(device: GPUDevice, grid: GpuGrid, opts: GpuParticlesOptions): Promise<GpuParticles> {
    const module = await compileShader(device, "particles", [buildPrelude(), rngWgsl, particleTypesWgsl, particlesWgsl].join("\n"));
    const buffers = createBuffers(device, opts.capacity);

    // Every slot starts free. Reversed so slot 0 is popped first, which makes buffer dumps easier to read.
    const free = Uint32Array.from({ length: opts.capacity }, (_, i) => opts.capacity - 1 - i);
    device.queue.writeBuffer(buffers.freeStack, 0, free);
    device.queue.writeBuffer(buffers.counters, 0, new Uint32Array([opts.capacity, 0])); // freeTop, requestCount

    const storage = (type: GPUBufferBindingType): GPUBindGroupLayoutEntry["buffer"] => ({ type });
    const mainLayout = device.createBindGroupLayout({
      label: "particles",
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: storage("storage") },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: storage("storage") },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: storage("storage") },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: storage("storage") },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: storage("uniform") },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: storage("read-only-storage") },
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: storage("storage") },
      ],
    });
    const argsLayout = device.createBindGroupLayout({
      label: "particles.args",
      entries: [{ binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: storage("storage") }],
    });
    const mainGroup = device.createBindGroup({
      label: "particles",
      layout: mainLayout,
      entries: [
        { binding: 0, resource: { buffer: buffers.particles } },
        { binding: 1, resource: { buffer: buffers.freeStack } },
        { binding: 2, resource: { buffer: buffers.counters } },
        { binding: 3, resource: { buffer: buffers.requests } },
        { binding: 4, resource: { buffer: buffers.params } },
        { binding: 5, resource: { buffer: grid.zoneWind } },
        { binding: 6, resource: { buffer: grid.cells } },
      ],
    });
    const argsGroup = device.createBindGroup({
      label: "particles.args",
      layout: argsLayout,
      entries: [{ binding: 0, resource: { buffer: buffers.emitArgs } }],
    });

    // update and emit see group 0 only; writeEmitArgs also gets group 1 (emitArgs), so emit never has it bound.
    const mainOnly = device.createPipelineLayout({ label: "particles", bindGroupLayouts: [mainLayout] });
    const withArgs = device.createPipelineLayout({ label: "particles.args", bindGroupLayouts: [mainLayout, argsLayout] });
    const pipeline = (entryPoint: string, layout: GPUPipelineLayout): GPUComputePipeline =>
      device.createComputePipeline({ label: `particles.${entryPoint}`, layout, compute: { module, entryPoint } });

    return new GpuParticles(device, opts, grid, buffers, {
      update: pipeline("update", mainOnly),
      emit: pipeline("emit", mainOnly),
      ignite: pipeline("ignite", mainOnly),
      writeEmitArgs: pipeline("writeEmitArgs", withArgs),
    }, mainGroup, argsGroup);
  }
}

function createBuffers(device: GPUDevice, capacity: number) {
  const buffer = (label: string, size: number, usage: number): GPUBuffer =>
    device.createBuffer({ label: `particles.${label}`, size, usage });
  const { STORAGE, COPY_DST, COPY_SRC, UNIFORM, INDIRECT, MAP_READ } = GPUBufferUsage;
  return {
    particles: buffer("state", capacity * PARTICLE_BYTES, STORAGE | COPY_SRC), // COPY_SRC: test readback
    freeStack: buffer("freeStack", capacity * 4, STORAGE | COPY_DST | COPY_SRC),
    counters: buffer("counters", 8, STORAGE | COPY_DST | COPY_SRC),
    requests: buffer("requests", MAX_REQUESTS * REQUEST_BYTES, STORAGE | COPY_DST),
    params: buffer("params", PARAMS_BYTES, UNIFORM | COPY_DST),
    emitArgs: buffer("emitArgs", 12, STORAGE | INDIRECT),
    aliveRead: buffer("aliveRead", 4, MAP_READ | COPY_DST), // Q8: freeTop copied here for getStats
  };
}
