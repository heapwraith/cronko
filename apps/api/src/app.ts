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
import { badgeRoute } from "./routes/badge"
import { exportRoute } from "./routes/export"
import { importRoute } from "./routes/import"
import { incidentsRoute } from "./routes/incidents"
import { maintenanceRoute } from "./routes/maintenance"
import { metricsRoute } from "./routes/metrics"
import { monitorsRoute } from "./routes/monitors"
import { notificationsRoute } from "./routes/notifications"
import { pingRoute } from "./routes/ping"
import { publicStatusRoute } from "./routes/public-status"
import { settingsRoute } from "./routes/settings"
import { statsRoute } from "./routes/stats"
import { statusPagesRoute } from "./routes/status-pages"

type Variables = {
  jwtPayload: { sub: string; email: string }
  requestId: string
  apiToken?: { id: string; scope: "read" | "write" }
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
// Prometheus scrape endpoint: off unless METRICS_TOKEN is set (see routes/metrics.ts).
app.route("/metrics", metricsRoute)
// Public status pages: read-only, no session (see routes/public-status.ts).
app.route("/public/status", publicStatusRoute)
app.use("/auth/*", csrf)
app.route("/auth", authRoute)

app.route("/badge", badgeRoute)

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

// A read-only token must not hand out the secrets that let someone send pings: the
// per-monitor ping token is removed from every JSON answer it receives. (A write token
// can create monitors and keeps seeing them; sessions are unaffected.)
function withoutPingTokens(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutPingTokens)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "token")
        .map(([key, v]) => [key, withoutPingTokens(v)]),
    )
  }
  return value
}
api.use("*", async (c, next) => {
  await next()
  if (c.get("apiToken")?.scope !== "read") return
  if (!c.res.headers.get("content-type")?.includes("application/json")) return
  const data = await c.res.clone().json()
  const headers = new Headers(c.res.headers)
  headers.delete("content-length")
  c.res = new Response(JSON.stringify(withoutPingTokens(data)), { status: c.res.status, headers })
})
api.route("/monitors", monitorsRoute)
api.route("/incidents", incidentsRoute)
api.route("/notifications", notificationsRoute)
api.route("/stats", statsRoute)
api.route("/settings", settingsRoute)
api.route("/audit", auditRoute)
api.route("/status-pages", statusPagesRoute)
api.route("/maintenance-windows", maintenanceRoute)
api.route("/import", importRoute)
api.route("/export", exportRoute)

app.route("/api", api)

registerOpenApi(app)

export { app }
export type AppType = typeof app
