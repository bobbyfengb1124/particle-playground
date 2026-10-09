/// <reference types="@vitest/browser/providers/playwright" />
import { defineConfig } from "vitest/config";

// GPU tests run inside headless Chromium. Playwright's default headless shell has no
// WebGPU, so this launches the full Chromium build (`channel: "chromium"`). The adapter
// is SwiftShader (software, identical on every machine) unless WEBGPU_ADAPTER=hardware,
// which runs the same tests on the real GPU.
const hardware = process.env.WEBGPU_ADAPTER === "hardware";

export default defineConfig({
  test: {
    include: ["tests/gpu/**/*.test.ts"],
    testTimeout: 60_000,
    browser: {
      enabled: true,
      provider: "playwright",
      name: "chromium",
      headless: true,
      screenshotFailures: false,
      providerOptions: {
        launch: {
          channel: "chromium",
          args: hardware
            ? ["--enable-unsafe-webgpu"]
            : ["--enable-unsafe-webgpu", "--enable-unsafe-swiftshader", "--use-webgpu-adapter=swiftshader"],
        },
      },
    },
  },
});
