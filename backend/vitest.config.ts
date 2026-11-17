import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Integration tests start real FFmpeg processes; run them with `npm run test:integration`.
    exclude: ["src/**/*.integration.test.ts", "node_modules/**"],
  },
});
