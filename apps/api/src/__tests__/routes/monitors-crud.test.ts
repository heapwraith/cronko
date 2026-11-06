import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setupTestDb } from "../helpers/testDb"

type Json = Record<string, unknown>

describe("monitors CRUD (HTTP, real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let app: Hono

  beforeAll(async () => {
    ctx = await setupTestDb()
    const { monitorsRoute } = await import("../../routes/monitors")
    app = new Hono().route("/api/monitors", monitorsRoute)
  })
  beforeEach(() => ctx.reset())

  const json = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })
  const data = async (res: Response) => ((await res.json()) as { data: Json }).data
  const create = async (name = "backup") =>
    data(await json("POST", "/api/monitors", { name, expectedIntervalSeconds: 3600 }))

  it("creates a monitor with a token and starts it pending", async () => {
    const res = await json("POST", "/api/monitors", {
      name: "backup",
      expectedIntervalSeconds: 3600,
    })
    expect(res.status).toBe(201)
    const m = await data(res)
    expect(m).toMatchObject({ name: "backup", status: "pending", expectedIntervalSeconds: 3600 })
    expect(typeof m.token).toBe("string")
    expect((m.token as string).length).toBeGreaterThan(10)
  })

  it("rejects an empty name", async () => {
    const res = await json("POST", "/api/monitors", { name: "" })
    expect(res.status).toBe(400)
  })

  it("lists monitors", async () => {
    await create("a")
    await create("b")
    const res = await json("GET", "/api/monitors")
    expect(res.status).toBe(200)
    const list = ((await res.json()) as { data: Json[] }).data
    expect(list.map((m) => m.name).sort()).toEqual(["a", "b"])
  })

  it("returns 404 for an unknown monitor", async () => {
    expect((await json("GET", "/api/monitors/nope")).status).toBe(404)
    expect((await json("POST", "/api/monitors/nope/pause")).status).toBe(404)
    expect((await json("POST", "/api/monitors/nope/resume")).status).toBe(404)
  })

  it("returns the detail with recent heartbeats and next expected run", async () => {
    const m = await create()
    const d = await data(await json("GET", `/api/monitors/${m.id}`))
    expect(d).toMatchObject({ id: m.id, recentHeartbeats: [] })
    expect(d.openIncident).toBeUndefined()
    expect(typeof d.nextExpectedAt).toBe("string")
  })

  it("updates a monitor", async () => {
    const m = await create()
    const res = await json("PATCH", `/api/monitors/${m.id}`, { name: "renamed" })
    expect(res.status).toBe(200)
    expect(await data(res)).toMatchObject({ id: m.id, name: "renamed" })
  })

  it("pauses and resumes, and a paused monitor has no next run", async () => {
    const m = await create()
    const paused = await data(await json("POST", `/api/monitors/${m.id}/pause`))
    expect(paused.paused).toBe(true)
    const d = await data(await json("GET", `/api/monitors/${m.id}`))
    expect(d.nextExpectedAt).toBeNull()
    const resumed = await data(await json("POST", `/api/monitors/${m.id}/resume`))
    expect(resumed.paused).toBe(false)
  })

  it("deletes a monitor", async () => {
    const m = await create()
    expect((await json("DELETE", `/api/monitors/${m.id}`)).status).toBe(200)
    expect((await json("GET", `/api/monitors/${m.id}`)).status).toBe(404)
  })

  it("exports heartbeats as CSV with a header", async () => {
    const m = await create()
    const res = await json("GET", `/api/monitors/${m.id}/heartbeats?format=csv`)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/csv")
    expect((await res.text()).split("\n")[0]).toBe("time,duration_ms,exit_code,source_ip,body")
  })

  it("clamps absurd pagination on a monitor's incidents", async () => {
    const m = await create()
    const res = await json("GET", `/api/monitors/${m.id}/incidents?limit=99999&offset=-5`)
    expect(res.status).toBe(200)
  })
})
