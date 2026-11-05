import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "database",
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts"],
    env: {
      DATABASE_URL: "file:./test.db",
    },
  },
});