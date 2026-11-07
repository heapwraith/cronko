import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { setupTestDb } from "../helpers/testDb"

vi.mock("../../services/notifier", () => ({
  sendNotification: async () => {},
  processDueDeliveries: async () => 0,
  cleanupDeliveries: async () => {},
  appLink: () => undefined,
}))

const RID_A = "123e4567-e89b-12d3-a456-426614174000"
const RID_B = "223e4567-e89b-12d3-a456-426614174001"

describe("ping API parity: /log, /<exit-status>, rid (real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let app: Hono
  let hb: typeof import("@cronko/database/queries/heartbeats")
  let monitors: typeof import("@cronko/database/queries/monitors")
  let monitorId = ""
  let token = ""

  beforeAll(async () => {
    ctx = await setupTestDb()
    const { pingRoute } = await import("../../routes/ping")
    hb = await import("@cronko/database/queries/heartbeats")
    monitors = await import("@cronko/database/queries/monitors")
    app = new Hono().route("/ping", pingRoute)
  })

  beforeEach(async () => {
    ctx.reset()
    const m = await monitors.createMonitor({
      id: crypto.randomUUID(),
      name: "etl",
      slug: `etl-${Math.random().toString(36).slice(2)}`,
      token: crypto.randomUUID(),
      expectedIntervalSeconds: 3600,
      gracePeriodSeconds: 60,
      now: new Date(),
    })
    token = m.token
    monitorId = m.id
    await monitors.transitionMonitorStatus(m.id, "pending", "healthy")
  })

  const ping = (path: string, init?: RequestInit) => app.request(`/ping/${token}${path}`, init)
  const runs = () => hb.findHeartbeatsByMonitor(monitorId, { limit: 20 })
  const status = async () => (await monitors.findMonitorById(monitorId))?.status

  describe("/log", () => {
    it("records the event with its body and changes nothing else", async () => {
      const res = await ping("/log", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "step 3 of 5",
      })
      expect(res.status).toBe(200)
      const logs = await hb.findPingLogsByMonitor(monitorId, { limit: 10 })
      expect(logs).toHaveLength(1)
      expect(logs[0]?.body).toBe("step 3 of 5")
      expect(await runs()).toHaveLength(0)
      expect(await status()).toBe("healthy")
    })

    it("does not recover a failed monitor nor close an open start", async () => {
      await ping("/fail")
      expect(await status()).toBe("failed")
      await ping("/start")
      await ping("/log")
      expect(await status()).toBe("failed")
      await ping("/finish?exit=1")
      const finish = (await runs()).find((r) => r.kind === "finish")
      expect(finish?.durationMs).not.toBeNull()
    })

    it("answers 404 for an unknown token and 413 for a large body", async () => {
      expect((await app.request("/ping/nope/log")).status).toBe(404)
      const res = await ping("/log", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "x".repeat(10_001),
      })
      expect(res.status).toBe(413)
    })

    it("honours the limit when listing", async () => {
      await ping("/log")
      await ping("/log")
      expect(await hb.findPingLogsByMonitor(monitorId, { limit: 1 })).toHaveLength(1)
    })
  })

  describe("/<exit-status>", () => {
    it("treats 0 as a success", async () => {
      await monitors.transitionMonitorStatus(monitorId, "healthy", "failed")
      expect((await ping("/0")).status).toBe(200)
      expect(await status()).toBe("healthy")
      expect((await runs())[0]?.exitCode).toBe(0)
    })

    it("treats any other integer as a failure with that exit code", async () => {
      expect((await ping("/2")).status).toBe(200)
      expect(await status()).toBe("failed")
      expect((await runs())[0]?.exitCode).toBe(2)
    })

    it("rejects values above 255 and non-numeric segments", async () => {
      expect((await ping("/256")).status).toBe(400)
      expect((await ping("/abc")).status).toBe(404)
    })

    it("accepts POST with a body", async () => {
      await ping("/1", { method: "POST", headers: { "content-type": "text/plain" }, body: "boom" })
      expect((await runs())[0]?.body).toBe("boom")
    })
  })

  describe("rid", () => {
    it("rejects a rid that is not a UUID", async () => {
      expect((await ping("/start?rid=nope")).status).toBe(400)
      expect(await runs()).toHaveLength(0)
    })

    it("pairs each finish with the start that has the same rid, out of order", async () => {
      const t = Date.now()
      await hb.createHeartbeat({
        id: "sA",
        monitorId,
        kind: "start",
        runId: RID_A,
        receivedAt: new Date(t - 300_000),
      })
      await hb.createHeartbeat({
        id: "sB",
        monitorId,
        kind: "start",
        runId: RID_B,
        receivedAt: new Date(t - 100_000),
      })
      // A finishes while B is the latest row: without rid it would close B.
      expect((await ping(`/finish?rid=${RID_A}`)).status).toBe(200)
      const rows = await runs()
      expect(rows.find((r) => r.id === "sA")?.durationMs ?? 0).toBeGreaterThanOrEqual(299_000)
      expect(rows.find((r) => r.id === "sB")?.durationMs).toBeNull()
      expect(rows.find((r) => r.kind === "finish")?.runId).toBe(RID_A)
    })

    it("a /fail with the rid closes its start and fails the monitor", async () => {
      await ping(`/start?rid=${RID_A}`)
      await ping(`/fail?rid=${RID_A}`)
      const rows = await runs()
      expect(rows.find((r) => r.kind === "start")?.durationMs).not.toBeNull()
      expect(rows.find((r) => r.kind === "finish")?.exitCode).toBe(1)
      expect(await status()).toBe("failed")
    })

    it("a plain success with the rid closes its start", async () => {
      await ping(`/start?rid=${RID_A}`)
      await ping(`/0?rid=${RID_A}`)
      expect((await runs()).find((r) => r.kind === "start")?.durationMs).not.toBeNull()
    })

    it("does not flag concurrent runs with different rids as overlapped", async () => {
      await ping(`/start?rid=${RID_A}`)
      await ping(`/start?rid=${RID_B}`)
      expect((await runs()).some((r) => r.overlapped)).toBe(false)
    })

    it("a rid with no matching start is kept as a plain run", async () => {
      expect((await ping(`/finish?rid=${RID_A}`)).status).toBe(200)
      const rows = await runs()
      expect(rows).toHaveLength(1)
      expect(rows[0]?.durationMs).toBeNull()
    })

    it("without rid /start + /start still flags the overlap", async () => {
      await ping("/start")
      await ping("/start")
      expect((await runs()).some((r) => r.overlapped)).toBe(true)
    })
  })
})
