import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { setupTestDb } from "../helpers/testDb"

vi.mock("../../services/notifier", () => ({
  sendNotification: async () => {},
  processDueDeliveries: async () => 0,
  cleanupDeliveries: async () => {},
  appLink: () => undefined,
}))

describe("/start + /finish timing (real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let app: Hono
  let hb: typeof import("@cronko/database/queries/heartbeats")
  let monitorId = ""
  let token = ""

  beforeAll(async () => {
    ctx = await setupTestDb()
    const { monitorsRoute } = await import("../../routes/monitors")
    const { pingRoute } = await import("../../routes/ping")
    hb = await import("@cronko/database/queries/heartbeats")
    app = new Hono().route("/api/monitors", monitorsRoute).route("/ping", pingRoute)
  })

  beforeEach(async () => {
    ctx.reset()
    const res = await app.request("/api/monitors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "etl", expectedIntervalSeconds: 3600 }),
    })
    const m = ((await res.json()) as { data: { id: string; token: string } }).data
    monitorId = m.id
    token = m.token
  })

  const ping = (path: string) => app.request(`/ping/${token}${path}`)
  const runs = () => hb.findHeartbeatsByMonitor(monitorId, { limit: 10 })

  it("times a /finish without ?d= from its open /start", async () => {
    // A start two minutes ago, written directly so the gap is real.
    await hb.createHeartbeat({
      id: "s1",
      monitorId,
      kind: "start",
      receivedAt: new Date(Date.now() - 120_000),
    })
    expect((await ping("/finish?exit=0")).status).toBe(200)

    const [finish, start] = await runs()
    expect(finish?.kind).toBe("finish")
    expect(finish?.durationMs).toBeGreaterThanOrEqual(119_000)
    expect(finish?.durationMs).toBeLessThan(125_000)
    expect(start?.durationMs).toBe(finish?.durationMs)
  })

  it("closes the start, so the next /start is not flagged as overlapping", async () => {
    await ping("/start")
    await ping("/finish")
    await ping("/start")
    const [latest] = await runs()
    expect(latest?.kind).toBe("start")
    expect(latest?.overlapped).toBe(false)
  })

  it("keeps a /finish?d= with no open /start as a plain run", async () => {
    expect((await ping("/finish?d=1500&exit=0")).status).toBe(200)
    const [run] = await runs()
    expect(run).toMatchObject({ kind: null, durationMs: 1500, exitCode: 0 })
  })

  it("never attaches a duration to an earlier plain ping", async () => {
    await ping("")
    await ping("/finish?d=900")
    const [finish, plain] = await runs()
    expect(plain?.durationMs).toBeNull()
    expect(finish?.durationMs).toBe(900)
  })
})
