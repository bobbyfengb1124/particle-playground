/** Timed passes per frame; a frame has about 5 (particles, grid step, lighting, render, plus any paint). */
const MAX_PASSES = 32;

export type TimerGroup = "sim" | "draw";

/** GPU ms per frame, split as in the readout (Q6). */
export interface GpuMs {
  sim: number;
  draw: number;
}

/**
 * Times GPU passes with timestamp-query: each pass stamps the GPU clock at its start and end,
 * and endFrame() adds up (end − start) per group. Gaps between submits aren't counted.
 */
export class GpuTimer {
  private groups: TimerGroup[] = [];
  private readPending = false;
  private totals: GpuMs = { sim: 0, draw: 0 };
  private frames = 0;
  private average: GpuMs = { sim: 0, draw: 0 };

  private constructor(
    private readonly device: GPUDevice,
    private readonly querySet: GPUQuerySet,
    private readonly resolveBuffer: GPUBuffer,
    private readonly readBuffer: GPUBuffer,
  ) {}

  /** Null when the device lacks timestamp-query; the readout then shows "GPU: n/a" (Q7). */
  static create(device: GPUDevice): GpuTimer | null {
    if (!device.features.has("timestamp-query")) return null;
    const size = MAX_PASSES * 2 * 8; // one u64 per stamp
    return new GpuTimer(
      device,
      device.createQuerySet({ label: "timer", type: "timestamp", count: MAX_PASSES * 2 }),
      device.createBuffer({ label: "timer.resolve", size, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }),
      device.createBuffer({ label: "timer.read", size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }),
    );
  }

  /** A pass's `timestampWrites`, taking the next start/end slot pair for `group`. */
  writes(group: TimerGroup): GPUComputePassTimestampWrites | undefined {
    // shortcut: passes past MAX_PASSES in one frame go untimed, so a paint-heavy frame reads low; raise MAX_PASSES if that shows.
    if (this.groups.length >= MAX_PASSES) return undefined;
    const i = this.groups.push(group) - 1;
    return { querySet: this.querySet, beginningOfPassWriteIndex: 2 * i, endOfPassWriteIndex: 2 * i + 1 };
  }

  /**
   * Call after the frame's last pass: resolves the stamps and reads them back without waiting.
   * One read at a time; a frame that finds one pending is left out of the average.
   */
  endFrame(): void {
    const groups = this.groups;
    this.groups = [];
    if (groups.length === 0 || this.readPending) return;

    const bytes = groups.length * 2 * 8;
    const encoder = this.device.createCommandEncoder({ label: "timer" });
    encoder.resolveQuerySet(this.querySet, 0, groups.length * 2, this.resolveBuffer, 0);
    encoder.copyBufferToBuffer(this.resolveBuffer, 0, this.readBuffer, 0, bytes);
    this.device.queue.submit([encoder.finish()]);

    this.readPending = true;
    this.readBuffer
      .mapAsync(GPUMapMode.READ, 0, bytes)
      .then(() => {
        const stamps = new BigUint64Array(this.readBuffer.getMappedRange(0, bytes));
        groups.forEach((group, i) => {
          const ns = Number(stamps[2 * i + 1] - stamps[2 * i]);
          this.totals[group] += Math.max(0, ns) / 1e6; // some drivers report end < start now and then
        });
        this.readBuffer.unmap();
        this.frames++;
      })
      .catch(() => {}) // only rejects on device loss or destroy(); the device-lost banner already reports it
      .finally(() => {
        this.readPending = false;
      });
  }

  /** The average per frame since the last call (Q13: averaged, not the latest frame); unchanged if no frame was read since. */
  takeMs(): GpuMs {
    if (this.frames > 0) {
      this.average = { sim: this.totals.sim / this.frames, draw: this.totals.draw / this.frames };
      this.totals = { sim: 0, draw: 0 };
      this.frames = 0;
    }
    return this.average;
  }

  destroy(): void {
    this.querySet.destroy();
    this.resolveBuffer.destroy();
    this.readBuffer.destroy();
  }
}
