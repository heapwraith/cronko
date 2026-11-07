import type { Context } from "hono"
import { Hono } from "hono"
import { clientIp } from "../lib/clientIp"
import { createWindowCounter, rateLimit } from "../middleware/rateLimit"
import { logAuditEvent } from "../services/audit"
import { processHeartbeat } from "../services/heartbeat"
import { PING_SLUG_PATTERN, verifyPingKey } from "../services/ping-key"
import { createMonitorSchema, insertMonitor } from "./monitors"
import { currentSettings } from "./settings"

export const pingRoute = new Hono()

const MAX_BODY_LENGTH = 10_000

type PingKind = "success" | "start" | "finish" | "fail" | "log"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
// Healthchecks reports an exit status as a 0-255 integer in the path.
const MAX_EXIT_STATUS = 255

// "/:token/*" also matches "/:token", so one registration counts every ping once.
// Slug pings (/k/<key>/<slug>) are limited per slug further down, once the key checks out.
pingRoute.use("/:token/*", (c, next) =>
  c.req.param("token") === "k" ? next() : rateLimit(c, next),
)

/** Wrong ping keys per client address: guessing is slowed down, a correct key is never blocked. */
const keyFailures = createWindowCounter(30)
/** Pings per slug per minute, like the per-token limit. */
const slugHits = createWindowCounter(() => currentSettings.pingRateLimitPerMinute)
/** Monitors a job may create with ?create=1: per hour, and in total. */
const createHits = createWindowCounter(20, 3_600_000)
const MAX_AUTO_CREATED = 100
const AUTO_TAG = "auto-created"
const DEFAULT_TIMEOUT_SECONDS = 86_400
const DEFAULT_GRACE_SECONDS = 3_600

/** Resolve `/k/<key>/<slug>` to the monitor's token, creating the monitor on request. */
async function resolveSlug(c: Context): Promise<{ token: string } | Response> {
  const ip = clientIp(c)
  if (!(await verifyPingKey(c.req.param("key") ?? ""))) {
    const { allowed } = keyFailures(ip)
    if (!allowed) return c.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, 429)
    return c.json({ error: "Monitor not found" }, 404)
  }

  const slug = c.req.param("slug") ?? ""
  if (!PING_SLUG_PATTERN.test(slug)) {
    return c.json({ error: "Invalid slug", code: "INVALID_SLUG" }, 400)
  }
  if (!slugHits(slug).allowed) {
    return c.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, 429)
  }

  const { findMonitorBySlug, findAllMonitors } = await import("@cronko/database/queries/monitors")
  const existing = await findMonitorBySlug(slug)
  if (existing) return { token: existing.token }
  if (c.req.query("create") !== "1") return c.json({ error: "Monitor not found" }, 404)

  const parsed = createMonitorSchema.safeParse({
    name: slug,
    expectedIntervalSeconds: intParam(c.req.query("timeout")) ?? DEFAULT_TIMEOUT_SECONDS,
    gracePeriodSeconds: intParam(c.req.query("grace")) ?? DEFAULT_GRACE_SECONDS,
    tags: [AUTO_TAG],
  })
  if (!parsed.success) {
    return c.json({ error: "Invalid timeout or grace", code: "VALIDATION_ERROR" }, 400)
  }
  const autoCreated = (await findAllMonitors()).filter((m) => m.tags.includes(AUTO_TAG)).length
  if (autoCreated >= MAX_AUTO_CREATED || !createHits("create").allowed) {
    return c.json({ error: "Auto-create limit reached", code: "QUOTA_EXCEEDED" }, 429)
  }
  const monitor = await insertMonitor(parsed.data)
  if (!monitor) return c.json({ error: "Monitor not found" }, 404)
  logAuditEvent({
    action: "monitor.auto_created",
    resourceType: "monitor",
    resourceId: monitor.id,
    metadata: { slug, sourceIp: ip },
  }).catch(() => {})
  return { token: monitor.token }
}

function intParam(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const n = Number.parseInt(value, 10)
  return Number.isNaN(n) ? undefined : n
}

/** Optional job output sent in a POST body (plain text, or JSON with body/log/text). */
async function readBody(c: Context): Promise<{ body?: string; tooLarge?: true }> {
  if (c.req.method !== "POST") return {}

  try {
    const contentType = c.req.header("content-type") ?? ""
    let raw: string | undefined

    if (contentType.includes("application/json")) {
      const json = await c.req.json()
      const candidate = json.body ?? json.log ?? json.text
      raw = typeof candidate === "string" ? candidate : undefined
    } else if (contentType.includes("text/plain")) {
      raw = await c.req.text()
    }

    if (raw === undefined) return {}
    if (raw.length > MAX_BODY_LENGTH) return { tooLarge: true }
    // Stored verbatim: it is job output, and the UI renders it as text.
    return { body: raw.trim() }
  } catch {
    return {} // malformed body: ignore, the ping itself still counts
  }
}

function handle(kind: PingKind) {
  return async (c: Context) => {
    const rid = c.req.query("rid")
    if (rid !== undefined && !UUID.test(rid)) {
      return c.json({ error: "rid must be a UUID", code: "INVALID_RID" }, 400)
    }
    const runId = rid?.toLowerCase()

    const exitParam = c.req.param("exit")
    const pathExit = exitParam === undefined ? undefined : Number.parseInt(exitParam, 10)
    if (pathExit !== undefined && pathExit > MAX_EXIT_STATUS) {
      return c.json({ error: "Exit status must be 0-255", code: "INVALID_EXIT_STATUS" }, 400)
    }

    let token = c.req.param("token") ?? ""
    if (c.req.param("slug") !== undefined) {
      const resolved = await resolveSlug(c)
      if (resolved instanceof Response) return resolved
      token = resolved.token
    }

    const { body, tooLarge } = await readBody(c)
    if (tooLarge) return c.json({ error: "Body too large", code: "PAYLOAD_TOO_LARGE" }, 413)

    // A negative duration is a client clock glitch, not data.
    const rawDuration = intParam(c.req.query("d"))
    const durationMs = rawDuration !== undefined && rawDuration >= 0 ? rawDuration : undefined
    let exitCode = pathExit ?? intParam(c.req.query("exit"))
    // An explicit failure with no exit code is reported as 1 so history shows it.
    if (kind === "fail") exitCode ??= 1

    const userAgent = c.req.header("user-agent")
    const result = await processHeartbeat(token, {
      sourceIp: clientIp(c),
      ...(userAgent !== undefined && { userAgent }),
      ...(durationMs !== undefined && { durationMs }),
      ...(exitCode !== undefined && { exitCode }),
      ...(body !== undefined && { body }),
      ...(runId !== undefined && { runId }),
      ...(kind === "log" && { logOnly: true }),
      ...(kind === "start" && { pulseType: "start" as const }),
      // With a run id, a success or failure closes the start that has the same id.
      ...((kind === "finish" || (runId !== undefined && kind !== "start" && kind !== "log")) && {
        pulseType: "finish" as const,
      }),
      ...(kind === "fail" && { failed: true }),
    })

    if (!result.ok) return c.json({ error: result.error }, result.status as 404)
    return c.json(result.data)
  }
}

for (const [suffix, kind] of [
  ["", "success"],
  ["/start", "start"],
  ["/finish", "finish"],
  ["/fail", "fail"],
  ["/log", "log"],
  ["/:exit{[0-9]+}", "success"],
] as const) {
  pingRoute.get(`/:token${suffix}`, handle(kind))
  pingRoute.post(`/:token${suffix}`, handle(kind))
  // By slug, with the instance ping key: /ping/k/<key>/<slug>[/start|/fail|...].
  pingRoute.get(`/k/:key/:slug${suffix}`, handle(kind))
  pingRoute.post(`/k/:key/:slug${suffix}`, handle(kind))
}
