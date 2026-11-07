import { createHash, timingSafeEqual } from "node:crypto"
import { countDeliveriesByStatus, findMonitorMetrics } from "@cronko/database/queries/metrics"
import { Hono } from "hono"
import { env } from "../env"

export const metricsRoute = new Hono()

const STATUSES = ["healthy", "missed", "down", "failed", "paused", "pending"]
const DELIVERY_STATUSES = ["pending", "failed"]

const escapeLabel = (v: string) =>
  v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")

const sha256 = (v: string) => createHash("sha256").update(v).digest()

/** Prometheus text exposition format 0.0.4. */
export function renderMetrics(): string {
  const monitors = findMonitorMetrics()
  const outbox = countDeliveriesByStatus()
  const out: string[] = []
  const family = (name: string, help: string, type = "gauge") => {
    out.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`)
  }
  const id = (m: { name: string; slug: string }) =>
    `monitor="${escapeLabel(m.name)}",slug="${escapeLabel(m.slug)}"`

  family("cronko_monitor_status", "1 for the monitor's current status, 0 for the others.")
  for (const m of monitors) {
    for (const s of STATUSES) {
      out.push(`cronko_monitor_status{${id(m)},status="${s}"} ${m.status === s ? 1 : 0}`)
    }
  }

  family("cronko_monitor_last_ping_timestamp_seconds", "Unix time of the latest ping received.")
  for (const m of monitors) {
    if (m.lastPingAt != null) {
      out.push(`cronko_monitor_last_ping_timestamp_seconds{${id(m)}} ${m.lastPingAt}`)
    }
  }

  family("cronko_monitor_last_duration_seconds", "Duration of the latest run that reported one.")
  for (const m of monitors) {
    if (m.lastDurationMs != null) {
      out.push(`cronko_monitor_last_duration_seconds{${id(m)}} ${m.lastDurationMs / 1000}`)
    }
  }

  family("cronko_monitor_expected_interval_seconds", "Interval the monitor expects between pings.")
  for (const m of monitors) {
    out.push(`cronko_monitor_expected_interval_seconds{${id(m)}} ${m.expectedIntervalSeconds}`)
  }

  family("cronko_monitor_grace_seconds", "Grace period before a late monitor is reported.")
  for (const m of monitors)
    out.push(`cronko_monitor_grace_seconds{${id(m)}} ${m.gracePeriodSeconds}`)

  family("cronko_monitor_paused", "1 when the monitor is paused (its status is kept), else 0.")
  for (const m of monitors) out.push(`cronko_monitor_paused{${id(m)}} ${m.paused ? 1 : 0}`)

  family("cronko_monitor_open_incidents", "Open incidents per monitor.")
  for (const m of monitors) out.push(`cronko_monitor_open_incidents{${id(m)}} ${m.openIncidents}`)

  family("cronko_open_incidents", "Open incidents across all monitors.")
  out.push(`cronko_open_incidents ${monitors.reduce((n, m) => n + m.openIncidents, 0)}`)

  family("cronko_notification_deliveries", "Notification outbox rows still pending or failed.")
  for (const s of DELIVERY_STATUSES) {
    out.push(`cronko_notification_deliveries{status="${s}"} ${outbox[s] ?? 0}`)
  }

  return `${out.join("\n")}\n`
}

metricsRoute.get("/", (c) => {
  const token = env.METRICS_TOKEN
  // Off by default: without a configured token the endpoint does not exist.
  if (!token) return c.json({ error: "Not found" }, 404)

  const match = /^Bearer (.+)$/.exec(c.req.header("authorization") ?? "")
  if (!match?.[1] || !timingSafeEqual(sha256(match[1]), sha256(token))) {
    return c.text("unauthorized", 401, { "WWW-Authenticate": 'Bearer realm="cronko-metrics"' })
  }

  return c.text(renderMetrics(), 200, {
    "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
    "Cache-Control": "no-store",
  })
})
