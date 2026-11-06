import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { setupTestDb } from "../helpers/testDb"

vi.mock("../../services/channels", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/channels")>()),
  deliver: async () => {},
}))

const HOUR = 3_600_000

describe("digest (settings, scheduler hook, outbox; real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let app: Hono
  let digest: typeof import("../../services/digest")
  let q: typeof import("@cronko/database/queries/notifications")
  let hb: typeof import("@cronko/database/queries/heartbeats")

  beforeAll(async () => {
    ctx = await setupTestDb()
    const { settingsRoute } = await import("../../routes/settings")
    const { monitorsRoute } = await import("../../routes/monitors")
    digest = await import("../../services/digest")
    q = await import("@cronko/database/queries/notifications")
    hb = await import("@cronko/database/queries/heartbeats")
    app = new Hono().route("/api/settings", settingsRoute).route("/api/monitors", monitorsRoute)
  })

  const req = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })
  const deliveries = () => q.findRecentDeliveries(50)
  /** The queued text itself (the delivery log API does not expose it). */
  const lastMessage = async () => {
    const { db } = await import("@cronko/database")
    const { notificationDeliveries } = await import("@cronko/database/schema")
    return (await db.select().from(notificationDeliveries).all()).at(-1)?.message ?? ""
  }
  const addChannel = (id = "ch1") =>
    q.createNotificationChannel({
      id,
      name: id,
      type: "webhook",
      enabled: true,
      config: { url: "http://hooks.local/x" },
    })

  beforeEach(() => ctx.reset())

  it("is off by default and validates frequency and hour", async () => {
    const data = ((await (await req("GET", "/api/settings")).json()) as { data: object }).data
    expect(data).toMatchObject({ digestFrequency: "off", digestHour: 9 })
    expect((await req("POST", "/api/settings", { digestFrequency: "hourly" })).status).toBe(400)
    expect((await req("POST", "/api/settings", { digestHour: 24 })).status).toBe(400)
    expect((await req("POST", "/api/settings", { timezone: "Mars/Olympus" })).status).toBe(400)
  })

  it("sends once per slot, never for a slot that passed before it was turned on", async () => {
    await addChannel()
    await req("POST", "/api/settings", { timezone: "UTC" })
    const now = new Date()
    // The slot one hour ago already passed when the digest is switched on.
    const hour = new Date(now.getTime() - HOUR).getUTCHours()
    expect(
      (await req("POST", "/api/settings", { digestFrequency: "daily", digestHour: hour })).status,
    ).toBe(200)

    expect(await digest.maybeSendDigest(now)).toBe(false)
    expect(await deliveries()).toHaveLength(0)

    const tomorrow = new Date(now.getTime() + 24 * HOUR)
    expect(await digest.maybeSendDigest(tomorrow)).toBe(true)
    expect(await digest.maybeSendDigest(new Date(tomorrow.getTime() + 60_000))).toBe(false)

    const [d] = await deliveries()
    expect(d).toMatchObject({ event: "digest", monitorName: "Resumo diário" })
    expect(await lastMessage()).toContain("📊 Resumo diário")
  })

  it("does nothing while off", async () => {
    await addChannel()
    expect(await digest.maybeSendDigest(new Date(Date.now() + 48 * HOUR))).toBe(false)
    expect(await deliveries()).toHaveLength(0)
  })

  it("reports runs and failures from the period", async () => {
    await addChannel()
    const res = await req("POST", "/api/monitors", {
      name: "nightly-etl",
      expectedIntervalSeconds: 3600,
    })
    const id = ((await res.json()) as { data: { id: string } }).data.id
    // Timestamps are stored in seconds and the period end is exclusive.
    const receivedAt = new Date(Date.now() - 60_000)
    await hb.createHeartbeat({ id: "h1", monitorId: id, exitCode: 0, receivedAt })
    await hb.createHeartbeat({ id: "h2", monitorId: id, exitCode: 3, receivedAt })

    const sent = await req("POST", "/api/settings/digest/test")
    expect(sent.status).toBe(200)
    expect(await sent.json()).toEqual({ data: { queued: 1 } })
    const text = await lastMessage()
    expect(text).toContain("• 2 execuções, 1 com falha")
    expect(text).toContain("Falhas: nightly-etl (1)")
  })

  it("test send needs an enabled channel", async () => {
    expect((await req("POST", "/api/settings/digest/test")).status).toBe(400)
  })
})
