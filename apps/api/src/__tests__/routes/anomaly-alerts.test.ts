import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { setupTestDb } from "../helpers/testDb"

type Sent = { event: string; detail: string | undefined; path: string | undefined }
const sent: Sent[] = []
vi.mock("../../services/notifier", () => ({
  sendNotification: async (_m: unknown, event: string, detail?: string, path?: string) => {
    sent.push({ event, detail, path })
  },
  processDueDeliveries: async () => 0,
  cleanupDeliveries: async () => {},
  appLink: () => undefined,
}))

describe("opt-in anomaly alerts (ping path, real SQLite)", () => {
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

  async function setup(alertOnAnomalies: boolean) {
    const res = await app.request("/api/monitors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "etl", expectedIntervalSeconds: 3600, alertOnAnomalies }),
    })
    const m = ((await res.json()) as { data: { id: string; token: string } }).data
    monitorId = m.id
    token = m.token
    // Ten normal runs of ~40 s, the newest an hour ago.
    for (let i = 0; i < 10; i++) {
      await hb.createHeartbeat({
        id: `base-${i}`,
        monitorId,
        durationMs: 38_000 + (i % 5) * 1_000,
        exitCode: 0,
        receivedAt: new Date(Date.now() - (11 - i) * 3_600_000),
      })
    }
    // The baseline setup itself must not alert.
    sent.length = 0
  }

  beforeEach(() => {
    ctx.reset()
    sent.length = 0
  })

  const ping = (path: string) => app.request(`/ping/${token}${path}`, { method: "POST" })

  it("stays quiet when the monitor did not opt in", async () => {
    await setup(false)
    await ping("?d=150000&exit=0")
    expect(sent.filter((s) => s.event === "unusual")).toEqual([])
  })

  it("alerts once for a run much slower than usual, linking to the run", async () => {
    await setup(true)
    await ping("?d=150000&exit=0")
    const unusual = sent.filter((s) => s.event === "unusual")
    expect(unusual).toHaveLength(1)
    expect(unusual[0]?.detail).toMatch(/^2 min 30 s, 3\.8× a mediana de 40\.0 s$/)
    expect(unusual[0]?.path).toMatch(new RegExp(`^/monitors/${monitorId}/runs/[\\w-]+$`))
  })

  it("does not alert for a normal run", async () => {
    await setup(true)
    await ping("?d=41000&exit=0")
    expect(sent.filter((s) => s.event === "unusual")).toEqual([])
  })

  it("does not pile an anomaly alert on top of a failure alert", async () => {
    await setup(true)
    await ping("/fail?d=150000&exit=2")
    expect(sent.map((s) => s.event)).toEqual(["failed"])
  })

  it("alerts on an overlapping start, once (not again on its finish)", async () => {
    await setup(true)
    await ping("/start")
    await ping("/start")
    await ping("/finish?d=1000&exit=0")
    expect(sent.filter((s) => s.event === "overlap")).toHaveLength(1)
  })

  it("can be switched on later with PATCH", async () => {
    await setup(false)
    const res = await app.request(`/api/monitors/${monitorId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ alertOnAnomalies: true }),
    })
    expect(res.status).toBe(200)
    await ping("?d=150000&exit=0")
    expect(sent.filter((s) => s.event === "unusual")).toHaveLength(1)
  })
})
