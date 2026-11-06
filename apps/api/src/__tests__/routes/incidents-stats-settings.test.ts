import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setupTestDb } from "../helpers/testDb"

type Json = Record<string, unknown>

describe("incidents, stats and settings routes (HTTP, real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let app: Hono
  let seed: (name: string, status: "healthy" | "down" | "failed" | "paused") => Promise<string>

  beforeAll(async () => {
    ctx = await setupTestDb()
    const { incidentsRoute } = await import("../../routes/incidents")
    const { statsRoute } = await import("../../routes/stats")
    const { settingsRoute } = await import("../../routes/settings")
    const monitors = await import("@cronko/database/queries/monitors")
    app = new Hono()
      .route("/api/incidents", incidentsRoute)
      .route("/api/stats", statsRoute)
      .route("/api/settings", settingsRoute)

    seed = async (name, status) => {
      const m = await monitors.createMonitor({
        id: crypto.randomUUID(),
        name,
        slug: `${name}-${Math.random().toString(36).slice(2)}`,
        token: crypto.randomUUID(),
        expectedIntervalSeconds: 600,
        gracePeriodSeconds: 60,
        now: new Date(),
      })
      if (status === "paused") await monitors.pauseMonitor(m.id)
      else await monitors.transitionMonitorStatus(m.id, "pending", status)
      return m.id
    }
  })
  beforeEach(() => ctx.reset())

  const get = async (path: string) => {
    const res = await app.request(path)
    return { res, body: (await res.json()) as { data: Json | Json[] } }
  }

  describe("incidents", () => {
    it("filters by status and paginates", async () => {
      const { createIncident, resolveIncident } = await import("@cronko/database/queries/incidents")
      const id = await seed("etl", "down")
      const t = new Date()
      await createIncident({ id: "i-open", monitorId: id, startedAt: t })
      await createIncident({ id: "i-done", monitorId: id, startedAt: new Date(t.getTime() - 1000) })
      await resolveIncident("i-done", t)

      const all = (await get("/api/incidents")).body.data as Json[]
      expect(all).toHaveLength(2)
      const open = (await get("/api/incidents?status=open")).body.data as Json[]
      expect(open.map((i) => i.id)).toEqual(["i-open"])
      const resolved = (await get("/api/incidents?status=resolved")).body.data as Json[]
      expect(resolved.map((i) => i.id)).toEqual(["i-done"])
      const page = (await get("/api/incidents?limit=1&offset=1")).body.data as Json[]
      expect(page).toHaveLength(1)
    })

    it("tolerates nonsense pagination", async () => {
      const { res } = await get("/api/incidents?limit=abc&offset=-9")
      expect(res.status).toBe(200)
    })
  })

  describe("stats", () => {
    it("counts monitors per state", async () => {
      await seed("a", "healthy")
      await seed("b", "down")
      await seed("c", "failed")
      await seed("d", "paused")
      const { body } = await get("/api/stats")
      expect(body.data).toMatchObject({
        healthyCount: 1,
        downCount: 1,
        failedCount: 1,
        pausedCount: 1,
        totalHeartbeats: 0,
      })
      expect((body.data as { heartbeatsByHour: number[] }).heartbeatsByHour).toHaveLength(24)
    })

    it("is well-defined with no monitors", async () => {
      const { res, body } = await get("/api/stats")
      expect(res.status).toBe(200)
      expect(body.data).toMatchObject({ healthyCount: 0, uptimePercent: 0 })
    })
  })

  describe("settings", () => {
    const post = (body: unknown) =>
      app.request("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })

    it("returns defaults, then persists an update", async () => {
      const before = (await get("/api/settings")).body.data as Json
      expect(before.instanceName).toBeTypeOf("string")

      const res = await post({ instanceName: "Prod Cronko", defaultGracePeriodSeconds: 300 })
      expect(res.status).toBe(200)
      const after = (await get("/api/settings")).body.data as Json
      expect(after).toMatchObject({ instanceName: "Prod Cronko", defaultGracePeriodSeconds: 300 })
    })

    it("rejects out-of-range values", async () => {
      expect((await post({ schedulerTickMs: 10 })).status).toBe(400)
      expect((await post({ pingRateLimitPerMinute: 0 })).status).toBe(400)
      expect((await post({ heartbeatHistoryDays: 9999 })).status).toBe(400)
      expect((await post({ instanceName: "" })).status).toBe(400)
    })
  })
})
