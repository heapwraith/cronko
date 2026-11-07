import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setupTestDb } from "../helpers/testDb"

const TOKEN = "scrape-token-0123456789"

describe("GET /metrics (HTTP, real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let app: Hono
  let setToken: (t: string | undefined) => void

  beforeAll(async () => {
    ctx = await setupTestDb()
    const { metricsRoute } = await import("../../routes/metrics")
    const { env } = await import("../../env")
    app = new Hono().route("/metrics", metricsRoute)
    setToken = (t) => {
      env.METRICS_TOKEN = t
    }
  })
  beforeEach(() => {
    ctx.reset()
    setToken(TOKEN)
  })

  const auth = { Authorization: `Bearer ${TOKEN}` }

  it("is disabled (404) when METRICS_TOKEN is unset, even with a header", async () => {
    setToken(undefined)
    expect((await app.request("/metrics")).status).toBe(404)
    expect((await app.request("/metrics", { headers: auth })).status).toBe(404)
  })

  it("rejects a missing or wrong token", async () => {
    expect((await app.request("/metrics")).status).toBe(401)
    const wrong = await app.request("/metrics", { headers: { Authorization: "Bearer nope" } })
    expect(wrong.status).toBe(401)
    expect(wrong.headers.get("www-authenticate")).toContain("Bearer")
    const basic = await app.request("/metrics", { headers: { Authorization: `Basic ${TOKEN}` } })
    expect(basic.status).toBe(401)
  })

  it("exposes monitors, incidents and the outbox in Prometheus text format", async () => {
    const monitors = await import("@cronko/database/queries/monitors")
    const incidents = await import("@cronko/database/queries/incidents")
    const { db, heartbeats, notificationChannels, notificationDeliveries } = await import(
      "@cronko/database"
    )
    const now = new Date(1_700_000_100_000)
    const mk = async (name: string, slug: string) =>
      monitors.createMonitor({
        id: crypto.randomUUID(),
        name,
        slug,
        token: crypto.randomUUID(),
        expectedIntervalSeconds: 600,
        gracePeriodSeconds: 60,
        now,
      })
    const etl = await mk('nightly "etl"', "etl")
    await mk("backup", "backup")
    await monitors.transitionMonitorStatus(etl.id, "pending", "down")
    const idle = await mk("idle", "idle")
    await monitors.pauseMonitor(idle.id)
    await incidents.createIncident({ id: "i1", monitorId: etl.id, startedAt: now })
    await db.insert(heartbeats).values([
      { id: "h1", monitorId: etl.id, receivedAt: new Date(1_700_000_000_000), durationMs: 1000 },
      { id: "h2", monitorId: etl.id, receivedAt: new Date(1_700_000_050_000), durationMs: 2500 },
      { id: "h3", monitorId: etl.id, receivedAt: new Date(1_700_000_090_000) },
    ])
    await db
      .insert(notificationChannels)
      .values({ id: "c1", name: "ch", type: "webhook", config: {}, createdAt: now })
    const delivery = (id: string, status: "pending" | "sent" | "failed") => ({
      id,
      channelId: "c1",
      monitorName: "etl",
      event: "down" as const,
      message: "m",
      status,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    })
    await db
      .insert(notificationDeliveries)
      .values([
        delivery("d1", "pending"),
        delivery("d2", "pending"),
        delivery("d3", "failed"),
        delivery("d4", "sent"),
      ])

    const res = await app.request("/metrics", { headers: auth })
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/plain")
    const text = await res.text()

    expect(text).toContain(
      'cronko_monitor_status{monitor="nightly \\"etl\\"",slug="etl",status="down"} 1',
    )
    expect(text).toContain(
      'cronko_monitor_status{monitor="nightly \\"etl\\"",slug="etl",status="healthy"} 0',
    )
    expect(text).toContain(
      'cronko_monitor_status{monitor="backup",slug="backup",status="pending"} 1',
    )
    expect(text).toContain(
      'cronko_monitor_last_ping_timestamp_seconds{monitor="nightly \\"etl\\"",slug="etl"} 1700000090',
    )
    // latest run that reported a duration, in seconds
    expect(text).toContain(
      'cronko_monitor_last_duration_seconds{monitor="nightly \\"etl\\"",slug="etl"} 2.5',
    )
    // a monitor with no ping has no timestamp/duration sample
    expect(text).not.toContain('last_ping_timestamp_seconds{monitor="backup"')
    expect(text).toContain(
      'cronko_monitor_open_incidents{monitor="nightly \\"etl\\"",slug="etl"} 1',
    )
    // interval, grace and the paused flag (a paused monitor keeps its status)
    expect(text).toContain(
      'cronko_monitor_expected_interval_seconds{monitor="nightly \\"etl\\"",slug="etl"} 600',
    )
    expect(text).toContain('cronko_monitor_grace_seconds{monitor="idle",slug="idle"} 60')
    expect(text).toContain('cronko_monitor_paused{monitor="idle",slug="idle"} 1')
    expect(text).toContain('cronko_monitor_paused{monitor="nightly \\"etl\\"",slug="etl"} 0')
    expect(text).toContain("cronko_open_incidents 1\n")
    expect(text).toContain('cronko_notification_deliveries{status="pending"} 2')
    expect(text).toContain('cronko_notification_deliveries{status="failed"} 1')
    expect(text).toContain("# TYPE cronko_monitor_status gauge")
    expect(text.endsWith("\n")).toBe(true)
  })

  it("reports zeros on an empty instance", async () => {
    const text = await (await app.request("/metrics", { headers: auth })).text()
    expect(text).toContain("cronko_open_incidents 0")
    expect(text).toContain('cronko_notification_deliveries{status="pending"} 0')
    expect(text).toContain('cronko_notification_deliveries{status="failed"} 0')
  })
})
