import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { setupTestDb } from "../helpers/testDb"

vi.mock("../../services/channels", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/channels")>()),
  deliver: async () => {},
}))

describe("mute alerts per monitor (HTTP + notifier, real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let app: Hono
  let notifier: typeof import("../../services/notifier")
  let q: typeof import("@cronko/database/queries/notifications")
  let monitorId = ""

  beforeAll(async () => {
    ctx = await setupTestDb()
    const { monitorsRoute } = await import("../../routes/monitors")
    notifier = await import("../../services/notifier")
    q = await import("@cronko/database/queries/notifications")
    app = new Hono().route("/api/monitors", monitorsRoute)
  })

  beforeEach(async () => {
    ctx.reset()
    await q.createNotificationChannel({
      id: "ch1",
      name: "ops",
      type: "webhook",
      enabled: true,
      config: { url: "http://hooks.local/x" },
    })
    const res = await app.request("/api/monitors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "etl", expectedIntervalSeconds: 3600 }),
    })
    monitorId = ((await res.json()) as { data: { id: string } }).data.id
  })

  const mute = (minutes: number | null, id = monitorId) =>
    app.request(`/api/monitors/${id}/mute`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ minutes }),
    })
  const queued = async () => (await q.findRecentDeliveries(50)).length

  it("mutes for N minutes and unmutes with null", async () => {
    const before = Date.now()
    const res = await mute(60)
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as { data: { mutedUntil: string } }
    const until = new Date(data.mutedUntil).getTime()
    expect(until).toBeGreaterThanOrEqual(before + 59 * 60_000)
    expect(until).toBeLessThanOrEqual(Date.now() + 61 * 60_000)

    const off = (await (await mute(null)).json()) as { data: { mutedUntil: string | null } }
    expect(off.data.mutedUntil).toBeNull()
  })

  it("validates the duration and the monitor", async () => {
    expect((await mute(0)).status).toBe(400)
    expect((await mute(60 * 24 * 31)).status).toBe(400)
    expect((await mute(60, "nope")).status).toBe(404)
  })

  it("suppresses alerts while muted and sends them again after unmute", async () => {
    await mute(60)
    await notifier.sendNotification({ id: monitorId, name: "etl" }, "failed")
    expect(await queued()).toBe(0)

    await mute(null)
    await notifier.sendNotification({ id: monitorId, name: "etl" }, "failed")
    expect(await queued()).toBe(1)
  })
})
