import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setupTestDb } from "../helpers/testDb"

type Run = { id: string; exitCode: number | null; body: string | null }
type Ctx = { run: Run; previous: Run | null; previousGood: Run | null; nextId: string | null }

describe("GET /api/monitors/:id/runs/:runId (real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let app: Hono
  let createHeartbeat: typeof import("@cronko/database/queries/heartbeats").createHeartbeat
  let monitorId = ""

  beforeAll(async () => {
    ctx = await setupTestDb()
    const { monitorsRoute } = await import("../../routes/monitors")
    ;({ createHeartbeat } = await import("@cronko/database/queries/heartbeats"))
    app = new Hono().route("/api/monitors", monitorsRoute)
  })

  beforeEach(async () => {
    ctx.reset()
    const res = await app.request("/api/monitors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "etl", expectedIntervalSeconds: 3600 }),
    })
    monitorId = ((await res.json()) as { data: { id: string } }).data.id
    const t0 = Date.now() - 4 * 3_600_000
    const rows: [string, number | null, string | null][] = [
      ["ok-1", 0, "all good"],
      ["fail-1", 2, "boom"],
      ["fail-2", 1, "boom again"],
      ["ok-2", null, null],
    ]
    for (const [i, [id, exitCode, body]] of rows.entries()) {
      await createHeartbeat({
        id,
        monitorId,
        receivedAt: new Date(t0 + i * 3_600_000),
        ...(exitCode !== null && { exitCode }),
        ...(body !== null && { body }),
      })
    }
  })

  const get = async (runId: string) => app.request(`/api/monitors/${monitorId}/runs/${runId}`)

  it("returns the run, the previous run and the last good run before it", async () => {
    const res = await get("fail-2")
    expect(res.status).toBe(200)
    const { data } = (await res.json()) as { data: Ctx }
    expect(data.run).toMatchObject({ id: "fail-2", exitCode: 1, body: "boom again" })
    expect(data.previous?.id).toBe("fail-1")
    expect(data.previousGood?.id).toBe("ok-1")
    expect(data.nextId).toBe("ok-2")
  })

  it("has no neighbours for the first run", async () => {
    const { data } = (await (await get("ok-1")).json()) as { data: Ctx }
    expect(data.previous).toBeNull()
    expect(data.previousGood).toBeNull()
    expect(data.nextId).toBe("fail-1")
  })

  it("returns 404 for an unknown run or a run of another monitor", async () => {
    expect((await get("nope")).status).toBe(404)
    const other = await app.request("/api/monitors/other/runs/ok-1")
    expect(other.status).toBe(404)
  })
})
