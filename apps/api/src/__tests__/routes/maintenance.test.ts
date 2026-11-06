import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { setupTestDb } from "../helpers/testDb"

vi.mock("../../services/channels", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../services/channels")>()),
  deliver: async () => {},
}))

type Json = Record<string, unknown>

/** A daily UTC window that started `minutesAgo` minutes ago, in cron form. */
function dailyStartingAgo(minutesAgo: number): string {
  const d = new Date(Date.now() - minutesAgo * 60_000)
  return `${d.getUTCMinutes()} ${d.getUTCHours()} * * *`
}

describe("maintenance windows (HTTP + notifier, real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let app: Hono
  let notifier: typeof import("../../services/notifier")
  let q: typeof import("@cronko/database/queries/notifications")
  const ids: Record<string, string> = {}

  beforeAll(async () => {
    ctx = await setupTestDb()
    const { maintenanceRoute } = await import("../../routes/maintenance")
    const { monitorsRoute } = await import("../../routes/monitors")
    notifier = await import("../../services/notifier")
    q = await import("@cronko/database/queries/notifications")
    app = new Hono()
      .route("/api/maintenance-windows", maintenanceRoute)
      .route("/api/monitors", monitorsRoute)
  })

  const req = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body !== undefined && { body: JSON.stringify(body) }),
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
    for (const [name, tags] of [
      ["etl", ["prod"]],
      ["report", ["staging"]],
    ] as const) {
      const res = await req("POST", "/api/monitors", {
        name,
        expectedIntervalSeconds: 3600,
        tags: [...tags],
      })
      ids[name] = ((await res.json()) as { data: { id: string } }).data.id
    }
  })

  const create = (body: Json) => req("POST", "/api/maintenance-windows", body)
  const window = (over: Json = {}) => ({
    name: "Nightly vacuum",
    schedule: dailyStartingAgo(10),
    timezone: "UTC",
    durationMinutes: 60,
    target: "all",
    ...over,
  })
  const queued = async () => (await q.findRecentDeliveries(50)).length
  const alert = (name: string) => notifier.sendNotification({ id: ids[name] ?? "", name }, "down")

  it("creates a window and reports it as running now, with its end", async () => {
    const res = await create(window())
    expect(res.status).toBe(201)
    const w = ((await res.json()) as { data: Json }).data
    expect(w.activeUntil).toEqual(expect.any(String))
    const ends = new Date(w.activeUntil as string).getTime()
    expect(ends - Date.now()).toBeGreaterThan(48 * 60_000)
    expect(ends - Date.now()).toBeLessThanOrEqual(50 * 60_000)
  })

  it("validates schedule, timezone, duration and target", async () => {
    expect((await create(window({ schedule: "every sunday" }))).status).toBe(400)
    expect((await create(window({ timezone: "Mars/Olympus" }))).status).toBe(400)
    expect((await create(window({ durationMinutes: 0 }))).status).toBe(400)
    expect((await create(window({ durationMinutes: 7 * 24 * 60 + 1 }))).status).toBe(400)
    expect((await create(window({ target: "tag", targetValue: "" }))).status).toBe(400)
    expect((await create(window({ target: "monitor", targetValue: "nope" }))).status).toBe(400)
  })

  it("holds back alerts for every monitor while an 'all' window runs", async () => {
    await create(window())
    await alert("etl")
    await alert("report")
    expect(await queued()).toBe(0)
  })

  it("holds back only the tagged monitors for a tag window", async () => {
    await create(window({ target: "tag", targetValue: "Prod" }))
    await alert("etl")
    expect(await queued()).toBe(0)
    await alert("report")
    expect(await queued()).toBe(1)
  })

  it("holds back only the chosen monitor for a monitor window", async () => {
    await create(window({ target: "monitor", targetValue: ids.etl }))
    await alert("report")
    expect(await queued()).toBe(1)
    await alert("etl")
    expect(await queued()).toBe(1)
  })

  it("lets alerts through outside the window and when the window is disabled", async () => {
    await create(window({ schedule: dailyStartingAgo(120) })) // ended an hour ago
    await alert("etl")
    expect(await queued()).toBe(1)

    const res = await create(window({ name: "Off", enabled: false }))
    expect(res.status).toBe(201)
    await alert("report")
    expect(await queued()).toBe(2)
  })

  it("updates, validating the merged result, and deletes", async () => {
    const res = await create(window())
    const id = ((await res.json()) as { data: { id: string } }).data.id
    const patch = (body: Json) => req("PATCH", `/api/maintenance-windows/${id}`, body)
    expect((await patch({ target: "tag" })).status).toBe(400) // tag target without a tag
    expect((await patch({ enabled: false })).status).toBe(200)
    await alert("etl")
    expect(await queued()).toBe(1)
    expect((await req("DELETE", `/api/maintenance-windows/${id}`)).status).toBe(200)
    expect((await req("DELETE", `/api/maintenance-windows/${id}`)).status).toBe(404)
  })
})
