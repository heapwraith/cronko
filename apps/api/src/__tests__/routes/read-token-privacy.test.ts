import type { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setupTestDb } from "../helpers/testDb"

describe("read-only API tokens never see ping tokens (full app, real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let app: Hono
  let cookie = ""
  const PING_TOKEN = "11111111-2222-3333-4444-555555555555"
  let monitorId = ""

  beforeAll(async () => {
    ctx = await setupTestDb()
    ;({ app } = (await import("../../app")) as unknown as { app: Hono })
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
    const { createMonitor } = await import("@cronko/database/queries/monitors")
    const m = await createMonitor({
      id: crypto.randomUUID(),
      name: "etl",
      slug: "etl",
      token: PING_TOKEN,
      expectedIntervalSeconds: 3600,
      gracePeriodSeconds: 60,
      now: new Date(),
    })
    monitorId = m.id
  })

  const call = (
    path: string,
    headers: Record<string, string> = {},
    method = "GET",
    body?: unknown,
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
  const mint = async (scope: "read" | "write") =>
    (
      (await (await call("/api/settings/tokens", {}, "POST", { name: scope, scope })).json()) as {
        data: { token: string }
      }
    ).data.token
  const as = (t: string) => ({ Authorization: `Bearer ${t}`, cookie: "" })

  it("hides the ping token from a read token on the list and the detail", async () => {
    const read = await mint("read")
    for (const path of ["/api/monitors", `/api/monitors/${monitorId}`]) {
      const res = await call(path, as(read))
      expect(res.status).toBe(200)
      const text = await res.text()
      expect(text).not.toContain(PING_TOKEN)
      expect(text).not.toContain('"token"')
      expect(text).toContain('"etl"')
    }
  })

  it("keeps the rest of the answer intact and valid", async () => {
    const read = await mint("read")
    const res = await call(`/api/monitors/${monitorId}`, as(read))
    expect(res.headers.get("content-type")).toContain("application/json")
    const body = (await res.json()) as { data: Record<string, unknown> }
    expect(body.data).toMatchObject({ id: monitorId, name: "etl", slug: "etl" })
    expect(body.data).not.toHaveProperty("token")
  })

  it("leaves a session and a write token unchanged", async () => {
    expect(await (await call("/api/monitors")).text()).toContain(PING_TOKEN)
    const write = await mint("write")
    expect(await (await call("/api/monitors", as(write))).text()).toContain(PING_TOKEN)
  })

  it("does not break errors or non-JSON answers for a read token", async () => {
    const read = await mint("read")
    expect((await call("/api/monitors/does-not-exist/incidents", as(read))).status).toBeLessThan(
      500,
    )
    const csv = await call(`/api/monitors/${monitorId}/export`, as(read))
    expect(csv.status).toBeLessThan(500)
  })
})
