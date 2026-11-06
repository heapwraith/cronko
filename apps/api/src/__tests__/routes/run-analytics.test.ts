import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { setupTestDb } from "../helpers/testDb"

vi.mock("../../services/notifier", () => ({
  sendNotification: async () => {},
  processDueDeliveries: async () => 0,
  cleanupDeliveries: async () => {},
  appLink: () => undefined,
}))

type Hb = {
  id: string
  kind: string | null
  overlapped: boolean
  durationMs: number | null
  unusuallySlow: boolean
}
type Stats = { count: number; p50: number; p95: number; max: number } | null

describe("run analytics (real SQLite)", () => {
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

  /** Seed plain runs, oldest first, one minute apart, ending an hour ago. */
  async function seedRuns(durations: number[]) {
    const t0 = Date.now() - 3_600_000 - durations.length * 60_000
    for (const [i, d] of durations.entries()) {
      await hb.createHeartbeat({
        id: `r${i}`,
        monitorId,
        durationMs: d,
        exitCode: 0,
        receivedAt: new Date(t0 + i * 60_000),
      })
    }
  }

  const detail = async () =>
    (
      (await (await app.request(`/api/monitors/${monitorId}`)).json()) as {
        data: { recentHeartbeats: Hb[]; typical: Stats }
      }
    ).data
  const run = async (runId: string) =>
    (
      (await (await app.request(`/api/monitors/${monitorId}/runs/${runId}`)).json()) as {
        data: { typical: Stats; unusuallySlow: boolean }
      }
    ).data

  it("tags /start and /finish rows and counts the run once", async () => {
    await app.request(`/ping/${token}/start`, { method: "POST" })
    await app.request(`/ping/${token}/finish?d=4200&exit=0`, { method: "POST" })
    const rows = (await detail()).recentHeartbeats
    expect(rows.map((r) => r.kind).sort()).toEqual(["finish", "start"])
    const samples = await hb.findRunSamples(monitorId, { limit: 10 })
    expect(samples.map((s) => s.durationMs)).toEqual([4200])
  })

  it("flags a run far slower than the runs before it, and not normal ones", async () => {
    await seedRuns([40_000, 41_000, 39_000, 40_000, 42_000, 40_000, 38_000, 130_000])
    const rows = (await detail()).recentHeartbeats
    const slow = rows.find((r) => r.id === "r7")
    expect(slow?.unusuallySlow).toBe(true)
    expect(rows.filter((r) => r.unusuallySlow)).toHaveLength(1)

    const page = await run("r7")
    expect(page.unusuallySlow).toBe(true)
    // The baseline excludes the run itself.
    expect(page.typical).toMatchObject({ count: 7, p50: 40_000, max: 42_000 })

    expect((await run("r6")).unusuallySlow).toBe(false)
  })

  it("does not flag anything with a short history", async () => {
    await seedRuns([1_000, 1_000, 120_000])
    const rows = (await detail()).recentHeartbeats
    expect(rows.some((r) => r.unusuallySlow)).toBe(false)
  })

  it("marks a start that arrives while the previous run is still open, and its finish", async () => {
    await app.request(`/ping/${token}/start`, { method: "POST" })
    await app.request(`/ping/${token}/start`, { method: "POST" })
    await app.request(`/ping/${token}/finish?d=1000&exit=0`, { method: "POST" })
    const rows = (await detail()).recentHeartbeats
    const flagged = rows.filter((r) => r.overlapped).map((r) => r.kind)
    expect(flagged.sort()).toEqual(["finish", "start"])
  })

  it("treats a start older than two intervals as abandoned, not overlapping", async () => {
    await hb.createHeartbeat({
      id: "old-start",
      monitorId,
      kind: "start",
      receivedAt: new Date(Date.now() - 3 * 3_600_000),
    })
    await app.request(`/ping/${token}/start`, { method: "POST" })
    const rows = (await detail()).recentHeartbeats
    expect(rows.some((r) => r.overlapped)).toBe(false)
  })
})
