import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    name: "api",
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    env: {
      DATABASE_URL: "file:./test.db",
      JWT_SECRET: "test-secret-key-minimum-32-characters-long",
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/**/__tests__/**", "src/test/**", "src/**/*.d.ts"],
      reporter: ["text-summary", "json-summary", "lcov"],
      // Measured on 2026-11 and set a few points below; raise when coverage grows.
      thresholds: { statements: 76, branches: 71, functions: 64, lines: 77 },
    },
  },
})
