import { sqliteClient } from "../index"

export type MonitorMetricsRow = {
  name: string
  slug: string
  status: string
  lastPingAt: number | null
  lastDurationMs: number | null
  openIncidents: number
}

/** One row per monitor with the numbers exported on /metrics. Timestamps are unix seconds. */
export function findMonitorMetrics(): MonitorMetricsRow[] {
  return sqliteClient
    .prepare(
      `SELECT m.name AS name, m.slug AS slug, m.status AS status,
        (SELECT MAX(h.received_at) FROM heartbeats h WHERE h.monitor_id = m.id) AS lastPingAt,
        (SELECT h.duration_ms FROM heartbeats h
          WHERE h.monitor_id = m.id AND h.duration_ms IS NOT NULL
          ORDER BY h.received_at DESC LIMIT 1) AS lastDurationMs,
        (SELECT COUNT(*) FROM incidents i
          WHERE i.monitor_id = m.id AND i.status = 'open') AS openIncidents
       FROM monitors m ORDER BY m.name`,
    )
    .all() as MonitorMetricsRow[]
}

/** Outbox size by delivery status (only the statuses that have rows). */
export function countDeliveriesByStatus(): Record<string, number> {
  const rows = sqliteClient
    .prepare("SELECT status, COUNT(*) AS n FROM notification_deliveries GROUP BY status")
    .all() as { status: string; n: number }[]
  return Object.fromEntries(rows.map((r) => [r.status, r.n]))
}
