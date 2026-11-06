import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setupTestDb } from "../helpers/testDb"

describe("monitor cron schedules (HTTP, real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let app: Hono

  beforeAll(async () => {
    ctx = await setupTestDb()
    const { monitorsRoute } = await import("../../routes/monitors")
    app = new Hono().route("/api/monitors", monitorsRoute)
  })
  beforeEach(() => ctx.reset())

  const post = (body: unknown) =>
    app.request("/api/monitors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  const patch = (id: string, body: unknown) =>
    app.request(`/api/monitors/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  const data = async (res: Response) =>
    ((await res.json()) as { data: Record<string, unknown> }).data

  it("creates a cron monitor and derives its interval from the schedule", async () => {
    const res = await post({
      name: "nightly",
      scheduleCron: "0 2 * * *",
      timezone: "America/Sao_Paulo",
    })
    expect(res.status).toBe(201)
    expect(await data(res)).toMatchObject({
      scheduleCron: "0 2 * * *",
      timezone: "America/Sao_Paulo",
      expectedIntervalSeconds: 86_400,
    })
  })

  it("defaults the timezone to UTC when only a cron is given", async () => {
    const m = await data(await post({ name: "hourly", scheduleCron: "0 * * * *" }))
    expect(m).toMatchObject({ timezone: "UTC", expectedIntervalSeconds: 3600 })
  })

  it("still creates a plain interval monitor without a cron", async () => {
    const m = await data(await post({ name: "plain", expectedIntervalSeconds: 600 }))
    expect(m).toMatchObject({ scheduleCron: null, timezone: null, expectedIntervalSeconds: 600 })
  })

  it.each([
    ["an invalid cron", { name: "a", scheduleCron: "not a cron" }],
    ["a cron with a seconds field", { name: "b", scheduleCron: "*/5 * * * * *" }],
    ["an unknown timezone", { name: "c", scheduleCron: "0 2 * * *", timezone: "Mars/Base" }],
    ["neither interval nor cron", { name: "d" }],
  ])("rejects %s with 400", async (_label, body) => {
    expect((await post(body)).status).toBe(400)
  })

  it("exposes nextExpectedAt on the list and the detail", async () => {
    const created = await data(
      await post({ name: "nightly", scheduleCron: "0 2 * * *", timezone: "UTC" }),
    )

    const list = (await (await app.request("/api/monitors")).json()) as {
      data: Array<{ nextExpectedAt: string | null }>
    }
    const next = list.data[0]?.nextExpectedAt
    expect(next).toBeTruthy()
    expect(new Date(next as string).toISOString()).toMatch(/T02:00:00\.000Z$/)

    const detail = await data(await app.request(`/api/monitors/${created.id}`))
    expect(detail.nextExpectedAt).toBe(next)
  })

  it("switches an existing monitor to a cron and back to an interval", async () => {
    const created = await data(await post({ name: "flex", expectedIntervalSeconds: 600 }))
    const id = created.id as string

    expect(
      await data(await patch(id, { scheduleCron: "*/15 * * * *", timezone: "UTC" })),
    ).toMatchObject({
      scheduleCron: "*/15 * * * *",
      expectedIntervalSeconds: 900,
    })

    expect(await data(await patch(id, { scheduleCron: null }))).toMatchObject({
      scheduleCron: null,
      timezone: null,
    })
    expect((await patch(id, { scheduleCron: "bad cron" })).status).toBe(400)
  })
})
