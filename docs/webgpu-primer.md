# WebGPU primer — through this project's code

A guide to the WebGPU backend added in Step 17b, written for someone who knows
TypeScript and this codebase but not GPU programming. Each concept is explained
plainly, then shown where it lives in our files and why it's done that way.

For the general API, see [webgpufundamentals.org](https://webgpufundamentals.org/)
(the best tutorial) and MDN's [WebGPU API](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API) reference.

## The big picture

The CPU runs the program; the GPU runs **many small copies of one function at
once**, one per cell or pixel. The CPU version of a tick is a loop over cells; the
GPU version is "run `stepPass` for every cell, all at the same time".

Two consequences shape everything below:

1. **The data lives in GPU memory.** The grid's cells are a GPU buffer the CPU
   can't read directly. Getting them back (for Save) is a deliberate, slow copy.
2. **The CPU only asks; the GPU does it later.** Calls like `dispatchWorkgroups`
   don't run anything — they record commands, which run after `submit`, in
   order, while the CPU moves on.

Files involved:

| File | Role |
| --- | --- |
| `src/gpu/GpuContext.ts` | Get a device; compile shaders; watch for device loss |
| `src/gpu/GpuGrid.ts` | The cell buffer and the compute passes that step/paint/clear it |
| `src/gpu/GpuRenderer.ts` | Draws the cell buffer onto `#scene` |
| `src/gpu/shaders/*.wgsl`, `prelude.ts` | The GPU code (WGSL) |
| `src/backend/gpu/GpuBackend.ts` | Implements `SimBackend` using the two above |
| `tests/gpu/` | Browser tests comparing the GPU against the CPU |

## 1. Adapter and device

An **adapter** is a physical (or software) GPU. A **device** is your private
connection to it; every buffer, shader and pipeline is created from the device.

`requestGpu` in `src/gpu/GpuContext.ts`:

```ts
const adapter = await navigator.gpu.requestAdapter();
if (!adapter) return null;
if (adapter.info.isFallbackAdapter && !opts.allowFallback) return null;
const device = await adapter.requestDevice();
```

- **No WebGPU → `null`**, never an exception. `main.ts` turns that `null` into the
  "WebGPU unavailable — running on CPU" banner.
- **Fallback adapter** = a software GPU such as SwiftShader: correct but slow. An
  explicit `?backend=gpu` accepts it (`allowFallback: true`); the planned
  auto-select in 17e won't.
- **Device loss.** A device can die mid-session (driver reset, GPU process crash).
  After that, every GPU call silently does nothing. `onDeviceLost` watches
  `device.lost` and ignores our own `destroy()`; `main.ts` stops the clock and
  shows "GPU device lost — reload".

## 2. Buffers

A **buffer** is a block of GPU memory. Its **usage flags** say what it may be used
for, and WebGPU rejects anything else. From `createBuffers` in `GpuGrid.ts`:

```ts
const cells = device.createBuffer({
  label: "grid.cells",
  size: width * height * 4,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
});
```

We have three kinds:

- **Storage** (`cells`, `stamps`, the render palette) — big arrays shaders can
  index, and (for `cells`) write.
- **Uniform** (`params`) — small, read-only settings every thread sees the same
  value of: width, height, seed, tick, which pass.
- **Staging** (in `readback`) — `MAP_READ`, the only kind the CPU can read.

**One `u32` per cell.** The CPU `Grid` keeps material and timer in separate
arrays; on the GPU we pack them into one 32-bit number, so a move is one read
and one write. The layout is defined once in `src/gpu/shaders/prelude.ts`:

```
bits 0–7    material   (MATERIAL_MASK = 0xff)
bit  8      processed  (PROCESSED_BIT)
bits 16–31  timer      (TIMER_SHIFT = 16)
```

`upload` packs (`material | timer << TIMER_SHIFT`) and `readback` unpacks.

Writing to a buffer from the CPU is `device.queue.writeBuffer(buffer, offset, data)`.

## 3. Shaders (WGSL)

GPU code is written in **WGSL**, a small Rust-like language. Ours is assembled
from pieces by `gridShaderSource()`:

```ts
[buildPrelude(), commonWgsl, sandWgsl, liquidWgsl, gridWgsl].join("\n")
```

- **`prelude.ts`** *generates* WGSL from the TS tables — `const MAT_SAND: u32 = 1u;`,
  the `density()` switch, the packing constants — so material ids can't drift
  between CPU and GPU. (`tests/unit/gpuPrelude.test.ts` checks it.)
- **`common.wgsl`** — `Params`, the cell buffer declaration, the RNG (`hash32`,
  `cellRng`, `nextU32`, twins of `src/core/cellRng.ts`) and grid helpers
  (`moveCell`, `swapCells`, twins of `Grid`).
- **`rules/sand.wgsl`, `rules/liquid.wgsl`** — line-for-line twins of
  `src/grid/rules/sand.ts` and `liquid.ts`. Each pair carries a "keep in step"
  comment: change one, change the other, and the parity tests will tell you if
  they disagree.
- **`grid.wgsl`** — the entry points: `clearProcessed`, `stepPass`, `paint`.
- **`?raw`** (`import commonWgsl from "./shaders/common.wgsl?raw"`) is Vite
  loading the file as a plain string.

**Compile errors.** WebGPU normally just logs shader errors to the console, and
things fail later with a vague message. `compileShader` asks for
`getCompilationInfo()` and throws `grid:123:5 <message>` plus the offending line.
The line number is in the **joined** string, not the individual `.wgsl` file —
which is why it prints the line itself.

WGSL notes that tripped us up:
- `pass` is a reserved word, hence `Params.passIndex`.
- Coordinates are `i32` because rules look at `x - 1`, which can be −1.
- The RNG is passed as `ptr<function, CellRng>` so that a rule's draws advance
  the caller's counter, like passing the CPU's `rng` object.

## 4. Pipelines, workgroups and dispatch

A **compute pipeline** is a compiled entry point, ready to run. `GpuGrid.create`
makes one per entry point:

```ts
const pipeline = (entryPoint: string): GPUComputePipeline =>
  device.createComputePipeline({ label: `grid.${entryPoint}`, layout: pipelineLayout, compute: { module, entryPoint } });
```

Threads are launched in **workgroups**. `@workgroup_size(8, 8)` in WGSL means each
group is 8×8 = 64 threads. `dispatchWorkgroups(gx, gy)` launches a gx × gy grid of
groups, and each thread finds its position in `@builtin(global_invocation_id)`.
We round up, so threads past the edge return early:

```wgsl
if (id.x >= params.width || id.y >= params.height) { return; }
```

**Why 9 passes.** If every cell moved at once, two sand grains could both fall
into the same empty cell. A rule only touches its 3×3 neighbourhood, so cells 3
apart can never collide. Each pass handles one of the 9 offsets
`(phaseX, phaseY)` in a 3×3 pattern — thread `(i, j)` visits cell
`(phaseX + 3i, phaseY + 3j)` — so a pass needs ⌈w/3⌉ × ⌈h/3⌉ threads:

```ts
const passGroupsX = Math.ceil(Math.ceil(this.width / 3) / 8);
```

This is exactly what the CPU `PhasedStepper` does in a loop, and the order of the
9 passes comes from the same `passOrder(seed, tick)`.

`clearProcessed` is 2-D over the whole grid (one thread per cell). A 1-D dispatch
would exceed WebGPU's limit of 65,535 groups per dimension on a 4K grid.

## 5. Bind groups — what `@group` / `@binding` mean

A shader declares numbered "sockets" for its data:

```wgsl
@group(0) @binding(0) var<storage, read_write> cells: array<u32>;
@group(0) @binding(1) var<uniform> params: Params;
@group(0) @binding(2) var<storage, read> stamps: array<Stamp>;
```

A **bind group** is the TS side that plugs actual buffers into those sockets:

```ts
entries: [
  { binding: 0, resource: { buffer: buffers.cells } },
  { binding: 1, resource: { buffer: buffers.params, size: SLOT_BYTES } },
  { binding: 2, resource: { buffer: buffers.stamps } },
],
```

The **bind group layout** describes the sockets' types. `GpuGrid` writes it out
explicitly so all three pipelines can share one bind group; `GpuRenderer` uses
`layout: "auto"` and asks the pipeline for it (`getBindGroupLayout(0)`).

**Dynamic offsets.** A step runs up to 36 passes (4 steps × 9), each needing
different `Params`. Rather than 36 buffers, `params` has 36 slots of 256 bytes
(WebGPU's required alignment), and each dispatch picks its slot:

```ts
compute.setBindGroup(0, this.bindGroup, [(s * PASS_COUNT + k) * SLOT_BYTES]);
```

## 6. Command encoder → submit

Work is recorded into a **command encoder**, then handed to the GPU with
`queue.submit`:

```ts
const encoder = this.device.createCommandEncoder({ label: "grid.step" });
const compute = encoder.beginComputePass({ label: "grid.step" });
// setPipeline / setBindGroup / dispatchWorkgroups, repeated
compute.end();
this.device.queue.submit([encoder.finish()]);
```

WebGPU guarantees each dispatch sees the previous one's writes, so the 9 passes
run strictly one after another, like the CPU loop.

**Why every `GpuGrid` method submits on its own.** `writeBuffer` takes effect at
the point it's called in the queue, but recorded dispatches only take effect at
`submit`. If two `paint` calls shared one encoder, both uploads would land before
either dispatch ran, and both dispatches would paint the *second* stamp list.
Submitting per call keeps "upload, then run" paired.

The same reasoning explains why `paint` batches only **consecutive same-material**
stamps: all stamps in one dispatch run at once, so overlapping squares of
different materials would race and the winner would be random. A change of
material starts a new submit, so the later stamp wins, as on the CPU.

`GpuBackend` also queues brush stamps (`pendingStamps`) and flushes them once per
tick or render: a fast drag makes dozens of stamps per frame, and one submit is
far cheaper than dozens.

## 7. Rendering

Drawing is a second, separate kind of GPU work. The cell buffer is **data**
(material ids), not pixels, so something has to turn ids into colours.

**Canvas setup** (`GpuRenderer.create`): `canvas.getContext("webgpu")`, then
`configure({ device, format, alphaMode: "premultiplied" })`. A canvas can only ever
have one kind of context — which is why `CpuBackend` creates its 2D context
lazily, and the CPU fallback in `main.ts` still works after a failed GPU attempt.

A **render pipeline** has two shaders (`src/gpu/shaders/render.wgsl`):

- The **vertex shader** (`vs`) places corners of triangles on screen. We draw
  one oversized triangle whose corners (−1,−1), (3,−1), (−1,3) cover the whole
  canvas — the "fullscreen triangle" trick, simpler than a two-triangle quad.
  `pass.draw(3)` runs it for 3 vertices, no vertex buffer needed.
- The **fragment shader** (`fs`) runs once per pixel and returns its colour:

```wgsl
let x = u32(pixel.x) / params.cellSize;
let y = u32(pixel.y) / params.cellSize;
return palette[cells[y * params.width + x] & MATERIAL_MASK];
```

The palette is `MATERIALS[].color` uploaded as a storage buffer by `paletteData()`;
EMPTY is fully transparent, so `#scene`'s black CSS background shows through, as
with the CPU `GridRenderer`.

The renderer reads **the same `cells` buffer** as the grid (`grid.cells`) — no copy.
Because `draw()` is submitted after any step/paint, it always shows their result.

## 8. Reading data back (Save)

The CPU can't read a storage buffer. `GpuGrid.readback` copies it into a staging
buffer the CPU *can* map, then waits:

```ts
encoder.copyBufferToBuffer(this.buffers.cells, 0, staging, 0, size);
this.device.queue.submit([encoder.finish()]);
await staging.mapAsync(GPUMapMode.READ);
```

`mapAsync` resolves only once the GPU has finished everything before it — that
wait is why Save became `async` in 17a. Readback is for Save and tests only,
never per frame.

## 9. How we know it's right (`tests/gpu/`)

GPU bugs are often silent: a bad command is skipped with only a console warning,
and wrong results just look slightly odd. So the GPU tests compare against the
CPU, exactly:

- **`gridParity.test.ts`** — run the same scene on `PhasedStepper` and `GpuGrid`
  for 1/50/200 ticks; every cell's material and timer must match.
  `describeMismatch` names the first differing cell.
- **`render.test.ts`** — GPU pixels vs CPU `GridRenderer` pixels, at 1 px and 4 px.
- **`gridCommands.test.ts`**, **`gpuBackend.test.ts`** — upload/readback
  round-trip, clear, paint, stamp flushing.
- **`gpuChecked`** (`tests/gpu/helpers.ts`) wraps calls in an error scope, so a
  validation error fails the test instead of being a console warning.
- **Mutation checks**: each test was confirmed to fail when a deliberate bug was
  introduced (swapped sand direction, wrong timer shift, no stamp flush, …).

Running them:

```sh
npm run test:gpu                          # SwiftShader (software; same on every machine)
WEBGPU_ADAPTER=hardware npm run test:gpu  # the real GPU
```

(PowerShell: `$env:WEBGPU_ADAPTER = "hardware"; npm run test:gpu`.)

They run in headless Chromium via Playwright; `vitest.gpu.config.ts` explains the
launch flags (the default headless shell has no WebGPU at all).

## Glossary

| Term | Meaning here |
| --- | --- |
| Adapter | A GPU, real or software |
| Device | Our connection to it; creates everything else |
| Buffer | A block of GPU memory (storage, uniform, staging) |
| WGSL | The GPU shader language |
| Entry point | A WGSL function the CPU can launch (`stepPass`, `paint`, `vs`, `fs`, …) |
| Pipeline | A compiled entry point (compute) or vertex+fragment pair (render) |
| Workgroup | A batch of threads (8×8 here) launched together |
| Dispatch | "Run this compute pipeline over this many workgroups" |
| Bind group | Buffers plugged into a shader's `@group/@binding` sockets |
| Encoder / submit | Record commands, then hand them to the GPU to run in order |
| Twin | A WGSL function that must behave exactly like a named TS one |
