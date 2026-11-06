import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "shared",
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/__tests__/**"],
      reporter: ["text-summary", "json-summary", "lcov"],
      // Measured on 2026-11 and set a few points below; raise when coverage grows.
      thresholds: { statements: 79, branches: 78, functions: 89, lines: 76 },
    },
  },
})
