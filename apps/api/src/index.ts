// biome-ignore-all assist/source/organizeImports: ./load-env must run before any workspace import
import "./load-env"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { db, sqliteClient } from "@cronko/database"
import { createUser, findUserByEmail } from "@cronko/database/queries/users"
import { serve } from "@hono/node-server"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { app } from "./app"
import { env } from "./env"
import { logger } from "./lib/logger"
import { hashPassword } from "./services/auth"
import { inboundEmailOptions, startInboundEmail, stopInboundEmail } from "./services/inbound-email"
import { schedulerMetrics, startScheduler, stopScheduler } from "./services/scheduler"
import { startSelfHeartbeat, stopSelfHeartbeat } from "./services/self-heartbeat"
import { registerWeb } from "./web"

// Migrations ship next to the code: ./packages/database/src/migrations in the
// Docker image (cwd=/app) and ../../packages/... when running from apps/api.
function resolveMigrationsDir(): string {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    "packages/database/src/migrations",
    "../../packages/database/src/migrations",
  ].filter((p): p is string => Boolean(p))
  const found = candidates.map((p) => resolve(p)).find((p) => existsSync(p))
  if (!found) {
    throw new Error(`migrations folder not found (tried: ${candidates.join(", ")})`)
  }
  return found
}

async function applyMigrations() {
  if (env.AUTO_MIGRATE !== "true") return

  migrate(db, { migrationsFolder: resolveMigrationsDir() })
  logger.info("SQLite migrations applied")
}

async function seedAdmin() {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return

  const existing = await findUserByEmail(env.ADMIN_EMAIL)
  if (existing) return

  const hash = await hashPassword(env.ADMIN_PASSWORD)
  await createUser({ email: env.ADMIN_EMAIL, passwordHash: hash })
  logger.info({ email: env.ADMIN_EMAIL }, "admin user created")
}

async function bootstrap() {
  // 1. Apply migrations first — tables must exist before any queries
  await applyMigrations()

  // 2. Seed admin user
  await seedAdmin()

  // Health endpoints
  app.get("/health", (c) => c.json({ ok: true, uptime: process.uptime() }))

  // Liveness probe
  app.get("/health/live", (c) => c.json({ status: "ok" }))

  // Readiness probe — database connectivity
  app.get("/health/ready", async (c) => {
    try {
      sqliteClient.prepare("SELECT 1").get()
      return c.json({ status: "ok", checks: { database: "up" } })
    } catch (err) {
      logger.error({ err }, "readiness check failed")
      return c.json({ status: "error", checks: { database: "down" } }, 503)
    }
  })

  // Scheduler metrics endpoint
  app.get("/health/metrics", (c) =>
    c.json({
      uptime: process.uptime(),
      scheduler: {
        lastTickAt: schedulerMetrics.lastTickAt,
        lastTickDurationMs: schedulerMetrics.lastTickDurationMs,
        tickErrors: schedulerMetrics.tickErrors,
        monitorsChecked: schedulerMetrics.monitorsChecked,
      },
      memory: process.memoryUsage(),
    }),
  )

  // Web app + SPA fallback must be registered last so API routes win.
  registerWeb(app)

  // 3. Start scheduler and HTTP server
  startScheduler()
  startSelfHeartbeat(env.SELF_HEARTBEAT_URL, env.SELF_HEARTBEAT_INTERVAL_SECONDS)
  startInboundEmail(inboundEmailOptions(env))

  const server = serve({ fetch: app.fetch, port: env.API_PORT, hostname: env.API_HOST })

  let shuttingDown = false

  const shutdown = async (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info({ signal }, "shutting down gracefully")

    stopScheduler()
    stopSelfHeartbeat()
    void stopInboundEmail()

    // Close HTTP server — allow in-flight requests to finish
    server.close(() => {
      logger.info("server closed")
      process.exitCode = 0
    })

    // Force shutdown after 30s as safety net
    setTimeout(() => {
      logger.error("forced shutdown after timeout")
      process.exitCode = 1
    }, 30_000).unref()
  }

  process.on("SIGTERM", () => {
    shutdown("SIGTERM").catch(() => {})
  })
  process.on("SIGINT", () => {
    shutdown("SIGINT").catch(() => {})
  })
}

bootstrap().catch((err) => {
  logger.error({ err }, "bootstrap failed")
  process.exit(1)
})
