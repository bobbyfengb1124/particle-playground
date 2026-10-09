import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // GPU tests need a real browser — they run via `npm run test:gpu` (vitest.gpu.config.ts).
    exclude: ["tests/gpu/**", "**/node_modules/**"],
  },
});
