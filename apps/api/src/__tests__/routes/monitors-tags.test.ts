import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setupTestDb } from "../helpers/testDb"

type M = { id: string; name: string; tags: string[] }

describe("monitor tags (HTTP, real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let app: Hono

  beforeAll(async () => {
    ctx = await setupTestDb()
    const { monitorsRoute } = await import("../../routes/monitors")
    app = new Hono().route("/api/monitors", monitorsRoute)
  })
  beforeEach(() => ctx.reset())

  const req = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })
  const create = async (name: string, tags?: string[]) =>
    (
      (await (
        await req("POST", "/api/monitors", {
          name,
          expectedIntervalSeconds: 3600,
          ...(tags && { tags }),
        })
      ).json()) as { data: M }
    ).data
  const list = async (query = "") =>
    ((await (await req("GET", `/api/monitors${query}`)).json()) as { data: M[] }).data

  it("defaults to no tags", async () => {
    expect((await create("plain")).tags).toEqual([])
  })

  it("stores tags normalized and deduped", async () => {
    const m = await create("etl", ["Produção", " ETL ", "etl", "#Backup!", ""])
    expect(m.tags).toEqual(["producao", "etl", "backup"])
  })

  it("updates and clears tags with PATCH", async () => {
    const m = await create("etl", ["a"])
    const patch = async (tags: string[]) =>
      ((await (await req("PATCH", `/api/monitors/${m.id}`, { tags })).json()) as { data: M }).data
    expect((await patch(["b", "c"])).tags).toEqual(["b", "c"])
    expect((await patch([])).tags).toEqual([])
  })

  it("rejects absurd input instead of storing it", async () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => `t${i}`)
    expect(
      (
        await req("POST", "/api/monitors", {
          name: "x",
          expectedIntervalSeconds: 60,
          tags: tooMany,
        })
      ).status,
    ).toBe(400)
    expect(
      (await req("POST", "/api/monitors", { name: "x", expectedIntervalSeconds: 60, tags: "prod" }))
        .status,
    ).toBe(400)
  })

  it("filters the list with ?tag= (case-insensitive)", async () => {
    await create("a", ["prod", "etl"])
    await create("b", ["prod"])
    await create("c", ["staging"])
    expect((await list("?tag=prod")).map((m) => m.name).sort()).toEqual(["a", "b"])
    expect((await list("?tag=PROD")).map((m) => m.name).sort()).toEqual(["a", "b"])
    expect(await list("?tag=nope")).toEqual([])
    expect(await list()).toHaveLength(3)
  })
})
