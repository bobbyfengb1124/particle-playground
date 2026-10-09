export interface GpuHandle {
  adapter: GPUAdapter;
  device: GPUDevice;
}

export interface RequestGpuOptions {
  /** Accept a software (fallback) adapter such as SwiftShader. Explicit `?backend=gpu` and the GPU tests allow it; auto-select (17e) won't. */
  allowFallback: boolean;
}

/** Returns a WebGPU adapter + device, or null if WebGPU is unavailable (or only a disallowed fallback adapter is). */
export async function requestGpu(opts: RequestGpuOptions): Promise<GpuHandle | null> {
  if (typeof navigator === "undefined" || !navigator.gpu) return null;
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return null;
    if (adapter.info.isFallbackAdapter && !opts.allowFallback) return null;
    const device = await adapter.requestDevice();
    return { adapter, device };
  } catch {
    return null;
  }
}

/**
 * Compiles WGSL and throws with the compiler's messages if it has errors —
 * WebGPU otherwise only logs them to the console and fails later at pipeline creation.
 */
export async function compileShader(device: GPUDevice, label: string, code: string): Promise<GPUShaderModule> {
  const module = device.createShaderModule({ label, code });
  const info = await module.getCompilationInfo();
  const errors = info.messages.filter((m) => m.type === "error");
  if (errors.length > 0) {
    const lines = code.split("\n");
    const detail = errors
      .map((m) => `${label}:${m.lineNum}:${m.linePos} ${m.message}\n    ${lines[m.lineNum - 1] ?? ""}`)
      .join("\n");
    throw new Error(`WGSL compile failed:\n${detail}`);
  }
  return module;
}

/** Calls `cb` if the device is lost for any reason other than our own `device.destroy()`. */
export function onDeviceLost(device: GPUDevice, cb: (message: string) => void): void {
  void device.lost.then((info) => {
    if (info.reason !== "destroyed") cb(info.message);
  });
}
