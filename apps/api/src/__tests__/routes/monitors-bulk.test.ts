import type { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setupTestDb } from "../helpers/testDb"

type Json = Record<string, unknown>

describe("bulk monitor actions (full app, real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let app: Hono
  let cookie = ""
  let monitors: typeof import("@cronko/database/queries/monitors")

  beforeAll(async () => {
    ctx = await setupTestDb()
    ;({ app } = (await import("../../app")) as unknown as { app: Hono })
    monitors = await import("@cronko/database/queries/monitors")
    const { createUser } = await import("@cronko/database/queries/users")
    const { hashPassword } = await import("../../services/auth")
    await createUser({ email: "ops@example.com", passwordHash: await hashPassword("pw-123456") })
  })

  beforeEach(async () => {
    ctx.reset()
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ email: "ops@example.com", password: "pw-123456" }),
    })
    cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? ""
  })

  const call = (
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) =>
    app.request(path, {
      method,
      headers: {
        cookie,
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
        origin: "http://localhost",
        ...headers,
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })
  const bulk = (body: unknown, headers?: Record<string, string>) =>
    call("POST", "/api/monitors/bulk", body, headers)
  const result = async (res: Response) =>
    (
      (await res.json()) as {
        data: { succeeded: number; failed: { id: string; reason: string }[] }
      }
    ).data

  async function seed(name: string, tags: string[] = []) {
    return monitors.createMonitor({
      id: crypto.randomUUID(),
      name,
      slug: name,
      token: crypto.randomUUID(),
      expectedIntervalSeconds: 3600,
      gracePeriodSeconds: 60,
      tags,
      now: new Date(),
    })
  }

  it("pauses and resumes several monitors at once", async () => {
    const [a, b, c] = [await seed("a"), await seed("b"), await seed("c")]
    const ids = [a.id, b.id]
    expect(await result(await bulk({ ids, action: "pause" }))).toEqual({ succeeded: 2, failed: [] })
    expect((await monitors.findMonitorById(a.id))?.paused).toBe(true)
    expect((await monitors.findMonitorById(b.id))?.paused).toBe(true)
    expect((await monitors.findMonitorById(c.id))?.paused).toBe(false)

    expect(await result(await bulk({ ids, action: "resume" }))).toEqual({
      succeeded: 2,
      failed: [],
    })
    expect((await monitors.findMonitorById(a.id))?.paused).toBe(false)
  })

  it("mutes for a while and unmutes with minutes: null", async () => {
    const a = await seed("a")
    await bulk({ ids: [a.id], action: "mute", minutes: 60 })
    const until = (await monitors.findMonitorById(a.id))?.mutedUntil
    expect(until && until.getTime() > Date.now() + 59 * 60_000).toBe(true)
    await bulk({ ids: [a.id], action: "mute", minutes: null })
    expect((await monitors.findMonitorById(a.id))?.mutedUntil).toBeNull()
  })

  it("deletes only the selected monitors", async () => {
    const [a, b, c] = [await seed("a"), await seed("b"), await seed("c")]
    expect(await result(await bulk({ ids: [a.id, c.id], action: "delete" }))).toMatchObject({
      succeeded: 2,
    })
    expect(await monitors.findMonitorById(a.id)).toBeUndefined()
    expect(await monitors.findMonitorById(c.id)).toBeUndefined()
    expect(await monitors.findMonitorById(b.id)).toBeDefined()
  })

  it("adds and removes a normalised tag, and is idempotent", async () => {
    const a = await seed("a", ["keep"])
    const b = await seed("b")
    await bulk({ ids: [a.id, b.id], action: "addTag", tag: "  Produção " })
    expect((await monitors.findMonitorById(a.id))?.tags).toEqual(["keep", "producao"])
    expect((await monitors.findMonitorById(b.id))?.tags).toEqual(["producao"])
    await bulk({ ids: [a.id, b.id], action: "addTag", tag: "producao" })
    expect((await monitors.findMonitorById(a.id))?.tags).toEqual(["keep", "producao"])

    await bulk({ ids: [a.id, b.id], action: "removeTag", tag: "producao" })
    expect((await monitors.findMonitorById(a.id))?.tags).toEqual(["keep"])
    expect((await monitors.findMonitorById(b.id))?.tags).toEqual([])
  })

  it("reports each failure on its own and still applies the rest", async () => {
    const full = await seed(
      "full",
      Array.from({ length: 10 }, (_, i) => `t${i}`),
    )
    const ok = await seed("ok")
    const res = await result(
      await bulk({ ids: [full.id, "missing-id", ok.id], action: "addTag", tag: "new" }),
    )
    expect(res.succeeded).toBe(1)
    expect(res.failed).toEqual(
      expect.arrayContaining([
        { id: full.id, reason: "too_many_tags" },
        { id: "missing-id", reason: "not_found" },
      ]),
    )
    expect((await monitors.findMonitorById(ok.id))?.tags).toEqual(["new"])
  })

  it("counts a repeated id once", async () => {
    const a = await seed("a")
    expect(await result(await bulk({ ids: [a.id, a.id, a.id], action: "pause" }))).toEqual({
      succeeded: 1,
      failed: [],
    })
  })

  it("rejects an empty list, more than 200 ids, an unknown action and a bad tag", async () => {
    expect((await bulk({ ids: [], action: "pause" })).status).toBe(400)
    const many = Array.from({ length: 201 }, (_, i) => `id-${i}`)
    expect((await bulk({ ids: many, action: "pause" })).status).toBe(400)
    expect((await bulk({ ids: ["x"], action: "explode" })).status).toBe(400)
    expect((await bulk({ ids: ["x"], action: "addTag", tag: "🔥" })).status).toBe(400)
    expect((await bulk({ ids: ["x"], action: "mute", minutes: 0 })).status).toBe(400)
  })

  it("needs a session or a write token: read tokens get 403", async () => {
    const a = await seed("a")
    expect((await bulk({ ids: [a.id], action: "pause" }, { cookie: "" })).status).toBe(401)
    const mk = async (scope: "read" | "write") =>
      (
        (await (await call("POST", "/api/settings/tokens", { name: scope, scope })).json()) as {
          data: { token: string }
        }
      ).data.token
    const read = await mk("read")
    const write = await mk("write")
    const as = (t: string) => ({ Authorization: `Bearer ${t}`, cookie: "" })
    expect((await bulk({ ids: [a.id], action: "pause" }, as(read))).status).toBe(403)
    expect((await monitors.findMonitorById(a.id))?.paused).toBe(false)
    expect((await bulk({ ids: [a.id], action: "pause" }, as(write))).status).toBe(200)
    expect((await monitors.findMonitorById(a.id))?.paused).toBe(true)
  })

  it("writes one audit event per request, with the ids only for deletions", async () => {
    const [a, b] = [await seed("a"), await seed("b")]
    await bulk({ ids: [a.id, b.id], action: "pause" })
    await bulk({ ids: [a.id], action: "delete" })
    await new Promise((r) => setTimeout(r, 50))
    const audit = (await (await call("GET", "/api/audit?limit=20")).json()) as { data: Json[] }
    const events = audit.data.filter((e) => e.action === "monitor.bulk")
    expect(events).toHaveLength(2)
    const text = JSON.stringify(events)
    expect(text).toContain('"action":"delete"')
    expect(text).toContain(a.id)
    expect(text).not.toContain(b.id)
  })
})
