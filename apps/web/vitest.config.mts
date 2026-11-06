import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    name: "web",
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/__tests__/**", "src/test/**", "src/**/*.d.ts"],
      reporter: ["text-summary", "json-summary", "lcov"],
      // Measured on 2026-11 and set a few points below; raise when coverage grows.
      thresholds: { statements: 25, branches: 23, functions: 21, lines: 26 },
    },
  },
})
