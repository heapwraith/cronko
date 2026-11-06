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
  },
})
