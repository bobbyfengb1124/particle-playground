import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  build: {
    target: "es2022", // top-level await in main.ts; Vite 5's default target rejects it
  },
  server: {
    port: 5173,
  },
});
