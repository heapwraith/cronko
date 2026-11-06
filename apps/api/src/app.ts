import { Hono } from "hono"
import { env } from "./env"
import { AppError, ErrorCode, errorResponse } from "./lib/errors"
import { logger } from "./lib/logger"
import { authenticate } from "./middleware/authenticate"
import { csrf } from "./middleware/csrf"
import { requestLogger } from "./middleware/requestLogger"
import { securityHeaders } from "./middleware/securityHeaders"
import { registerOpenApi } from "./openapi"
import { auditRoute } from "./routes/audit"
import { authRoute } from "./routes/auth"
import { incidentsRoute } from "./routes/incidents"
import { monitorsRoute } from "./routes/monitors"
import { notificationsRoute } from "./routes/notifications"
import { pingRoute } from "./routes/ping"
import { settingsRoute } from "./routes/settings"
import { statsRoute } from "./routes/stats"

type Variables = {
  jwtPayload: { sub: string; email: string }
  requestId: string
}

const app = new Hono<{ Variables: Variables }>()

// Request ID middleware — generates unique ID for every request
app.use("*", requestLogger)

app.use("*", async (c, next) => {
  const requestId = crypto.randomUUID()
  c.set("requestId", requestId)
  c.res.headers.set("X-Request-Id", requestId)
  await next()
})

app.use("*", securityHeaders)

app.onError((err, c) => {
  const requestId = c.get("requestId") as string | undefined

  if (err instanceof AppError) {
    if (env.NODE_ENV === "development") {
      logger.error({ requestId, code: err.code }, err.message)
    }
    return c.json(errorResponse(err.message, err.code, err.status, requestId), err.status as 200)
  }

  logger.error({ requestId, err }, "unhandled error")

  const isProd = env.NODE_ENV === "production"
  return c.json(
    errorResponse(
      isProd ? "Internal server error" : (err as Error).message,
      ErrorCode.INTERNAL_ERROR,
      500,
      requestId,
    ),
    500,
  )
})

app.route("/ping", pingRoute)
app.use("/auth/*", csrf)
app.route("/auth", authRoute)

app.get("/badge/:token", async (c) => {
  const { findMonitorByToken } = await import("@cronko/database/queries/monitors")
  const token = c.req.param("token") ?? ""
  const monitor = await findMonitorByToken(token)

  if (!monitor) {
    return c.text("monitor not found", 404)
  }

  const colors: Record<string, string> = {
    healthy: "#10b981",
    missed: "#f59e0b",
    failed: "#dc2626",
    down: "#ef4444",
    paused: "#6b7280",
    pending: "#3b82f6",
  }
  const labels: Record<string, string> = {
    healthy: "healthy",
    missed: "missed",
    failed: "failed",
    down: "down",
    paused: "paused",
    pending: "pending",
  }

  const color = colors[monitor.status] ?? "#6b7280"
  const label = labels[monitor.status] ?? monitor.status
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="20">
  <rect width="60" height="20" fill="#555" rx="3"/>
  <rect x="60" width="60" height="20" fill="${color}" rx="3"/>
  <text x="30" y="14" text-anchor="middle" fill="#fff" font-size="10" font-family="sans-serif">cronko</text>
  <text x="90" y="14" text-anchor="middle" fill="#fff" font-size="10" font-family="sans-serif">${label}</text>
</svg>`

  return c.text(svg, 200, {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "public, max-age=30",
  })
})

const api = new Hono<{ Variables: Variables }>()

// Authenticated data changes on every ping or action: always revalidate, never
// let the browser reuse a stale copy (a refetch right after an action must see it).
api.use("*", async (c, next) => {
  await next()
  if (c.req.method === "GET") {
    c.res.headers.set("Cache-Control", "private, no-cache")
  }
})

api.use("*", authenticate)
api.use("*", csrf)
api.route("/monitors", monitorsRoute)
api.route("/incidents", incidentsRoute)
api.route("/notifications", notificationsRoute)
api.route("/stats", statsRoute)
api.route("/settings", settingsRoute)
api.route("/audit", auditRoute)

app.route("/api", api)

registerOpenApi(app)

export { app }
export type AppType = typeof app
