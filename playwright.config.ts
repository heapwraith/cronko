import { resolve } from "node:path"
import { defineConfig, devices } from "@playwright/test"

const PORT = 3077
const scratch = resolve(process.cwd(), ".e2e")

export const ADMIN = { email: "e2e@example.com", password: "e2e-password-123" }

/**
 * End-to-end smoke: builds the web app, boots the real API on a fresh SQLite file
 * and drives Chromium through the core loop (login → monitor → failing ping → run).
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "pt-BR",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `rm -rf "${scratch}" && mkdir -p "${scratch}" && pnpm --filter @cronko/web build && pnpm --filter @cronko/api exec tsx src/index.ts`,
    url: `http://localhost:${PORT}/health/ready`,
    timeout: 180_000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: `file:${scratch}/e2e.db`,
      API_PORT: String(PORT),
      JWT_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e-secret",
      ADMIN_EMAIL: ADMIN.email,
      ADMIN_PASSWORD: ADMIN.password,
      NODE_ENV: "development",
      AUTO_MIGRATE: "true",
    },
  },
})
