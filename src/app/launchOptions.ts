import type { BackendKind } from "../backend/SimBackend";

export interface LaunchOptions {
  backend: BackendKind | "auto"; // "auto" = GPU if a real (non-software) adapter exists, else CPU
  cellSize: 1 | 2 | 4 | null; // null = use the backend's default
}

export function readLaunchOptions(search: string): LaunchOptions {
  const params = new URLSearchParams(search);
  const param = params.get("backend");
  const backend = param === "gpu" || param === "cpu" ? param : "auto"; // a typo acts like no param
  const cell = Number(params.get("cell"));
  const cellSize = cell === 1 || cell === 2 || cell === 4 ? cell : null;
  return { backend, cellSize };
}
