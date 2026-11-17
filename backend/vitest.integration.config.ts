import { defineConfig } from "vitest/config";

// Tests that run real FFmpeg and ffprobe processes. They need both on PATH.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.integration.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
