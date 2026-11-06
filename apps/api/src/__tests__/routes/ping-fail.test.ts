import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { setupTestDb } from "../helpers/testDb"

const sent: string[] = []
vi.mock("../../services/notifier", () => ({
  sendNotification: async (_m: unknown, event: string) => {
    sent.push(event)
  },
  processDueDeliveries: async () => 0,
  cleanupDeliveries: async () => {},
}))

describe("/ping/:token/fail (HTTP, real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let app: Hono
  let token = ""
  let monitorId = ""
  let status: () => Promise<string | undefined>
  let createFixture: () => Promise<void>

  beforeAll(async () => {
    ctx = await setupTestDb()
    const { pingRoute } = await import("../../routes/ping")
    const monitors = await import("@cronko/database/queries/monitors")
    app = new Hono().route("/ping", pingRoute)
    status = async () => (await monitors.findMonitorById(monitorId))?.status

    createFixture = async () => {
      const m = await monitors.createMonitor({
        id: crypto.randomUUID(),
        name: "nightly",
        slug: `nightly-${Math.random().toString(36).slice(2)}`,
        token: crypto.randomUUID(),
        expectedIntervalSeconds: 600,
        gracePeriodSeconds: 60,
        now: new Date(),
      })
      token = m.token
      monitorId = m.id
      await monitors.transitionMonitorStatus(m.id, "pending", "healthy")
    }
  })

  beforeEach(async () => {
    ctx.reset()
    sent.length = 0
    await createFixture()
  })

  it("GET /fail marks the monitor failed", async () => {
    const res = await app.request(`/ping/${token}/fail`)
    expect(res.status).toBe(200)
    expect(await status()).toBe("failed")
    expect(sent).toEqual(["failed"])
  })

  it("POST /fail stores the job output verbatim", async () => {
    const out = "pg_dump: error: <connection refused> & more"
    const res = await app.request(`/ping/${token}/fail?exit=3`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: out,
    })
    expect(res.status).toBe(200)

    const { findHeartbeatsByMonitor } = await import("@cronko/database/queries/heartbeats")
    const [hb] = await findHeartbeatsByMonitor(monitorId, { limit: 1 })
    expect(hb).toMatchObject({ exitCode: 3, body: out })
  })

  it("/fail without an exit code records exit code 1", async () => {
    await app.request(`/ping/${token}/fail`)
    const { findHeartbeatsByMonitor } = await import("@cronko/database/queries/heartbeats")
    const [hb] = await findHeartbeatsByMonitor(monitorId, { limit: 1 })
    expect(hb?.exitCode).toBe(1)
  })

  it("?exit=0 on a normal ping stays healthy", async () => {
    await app.request(`/ping/${token}?exit=0`)
    expect(await status()).toBe("healthy")
    expect(sent).toEqual([])
  })

  it("unknown token -> 404 on /fail", async () => {
    expect((await app.request("/ping/nope/fail")).status).toBe(404)
  })

  it("rejects oversized output with 413", async () => {
    const res = await app.request(`/ping/${token}/fail`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "x".repeat(10_001),
    })
    expect(res.status).toBe(413)
    expect(await status()).toBe("healthy")
  })
})
