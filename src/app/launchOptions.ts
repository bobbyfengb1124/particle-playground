import type { BackendKind } from "../backend/SimBackend";

export interface LaunchOptions {
  backend: BackendKind;
  cellSize: 1 | 2 | 4 | null; // null = use the backend's default
}

export function readLaunchOptions(search: string): LaunchOptions {
  const params = new URLSearchParams(search);
  const backend: BackendKind = params.get("backend") === "gpu" ? "gpu" : "cpu";
  const cell = Number(params.get("cell"));
  const cellSize = cell === 1 || cell === 2 || cell === 4 ? cell : null;
  return { backend, cellSize };
}
