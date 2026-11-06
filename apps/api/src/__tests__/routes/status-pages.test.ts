import type { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setupTestDb } from "../helpers/testDb"

type Json = Record<string, unknown>

describe("status pages (full app, real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let app: Hono
  let cookie = ""
  let monitors: typeof import("@cronko/database/queries/monitors")
  let incidents: typeof import("@cronko/database/queries/incidents")
  let heartbeats: typeof import("@cronko/database/queries/heartbeats")

  beforeAll(async () => {
    ctx = await setupTestDb()
    ;({ app } = (await import("../../app")) as unknown as { app: Hono })
    monitors = await import("@cronko/database/queries/monitors")
    incidents = await import("@cronko/database/queries/incidents")
    heartbeats = await import("@cronko/database/queries/heartbeats")
    // reset() keeps users, so the admin is created once.
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

  /** Authenticated admin call, shaped like a same-origin browser request. */
  const admin = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: {
        cookie,
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
        origin: "http://localhost",
      },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })
  const pub = (slug: string) => app.request(`/public/status/${slug}`)

  async function seedMonitor(name: string, tags: string[], status = "healthy") {
    const m = await monitors.createMonitor({
      id: crypto.randomUUID(),
      name,
      slug: name,
      token: `secret-token-${name}`,
      expectedIntervalSeconds: 3600,
      gracePeriodSeconds: 60,
      tags,
      now: new Date(Date.now() - 10 * 86_400_000),
    })
    if (status !== "pending")
      await monitors.transitionMonitorStatus(m.id, "pending", status as never)
    await heartbeats.createHeartbeat({
      id: crypto.randomUUID(),
      monitorId: m.id,
      sourceIp: "10.9.8.7",
      exitCode: 3,
      body: "SECRET OUTPUT password=hunter2",
    })
    return m
  }

  it("requires a session for the admin API but not for the public page", async () => {
    expect((await app.request("/api/status-pages")).status).toBe(401)
    expect((await admin("GET", "/api/status-pages")).status).toBe(200)
  })

  it("creates pages off by default and validates slug, tag and title", async () => {
    const res = await admin("POST", "/api/status-pages", {
      slug: "prod",
      title: "Prod",
      tag: "Produção",
    })
    expect(res.status).toBe(201)
    const page = ((await res.json()) as { data: Json }).data
    expect(page).toMatchObject({ slug: "prod", tag: "producao", enabled: false })

    expect(
      (await admin("POST", "/api/status-pages", { slug: "prod", title: "x", tag: "a" })).status,
    ).toBe(409)
    expect(
      (await admin("POST", "/api/status-pages", { slug: "Bad Slug", title: "x", tag: "a" })).status,
    ).toBe(400)
    expect(
      (await admin("POST", "/api/status-pages", { slug: "ok", title: "", tag: "a" })).status,
    ).toBe(400)
    expect(
      (await admin("POST", "/api/status-pages", { slug: "ok", title: "x", tag: "🔥" })).status,
    ).toBe(400)
  })

  it("answers missing, disabled and malformed pages with the same 404", async () => {
    await admin("POST", "/api/status-pages", { slug: "hidden", title: "Hidden", tag: "prod" })
    const bodies = await Promise.all(
      ["hidden", "does-not-exist", "..%2Fapi", "UPPER"].map(async (s) => {
        const r = await pub(s)
        return `${r.status} ${await r.text()}`
      }),
    )
    expect(new Set(bodies).size).toBe(1)
    expect(bodies[0]).toMatch(/^404 /)
  })

  it("shows only the tagged monitors and only public fields", async () => {
    const etl = await seedMonitor("etl", ["prod"], "down")
    await seedMonitor("billing", ["prod"], "healthy")
    await seedMonitor("internal", ["staging"], "healthy")
    await incidents.createIncident({
      id: "i1",
      monitorId: etl.id,
      startedAt: new Date(Date.now() - 3_600_000),
    })

    const created = await admin("POST", "/api/status-pages", {
      slug: "prod",
      title: "Acme status",
      description: "Nightly jobs",
      tag: "prod",
      enabled: true,
    })
    expect(created.status).toBe(201)

    const res = await pub("prod")
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toBe("public, max-age=30")
    const raw = await res.text()
    const { data } = JSON.parse(raw) as { data: Json & { monitors: Json[]; incidents: Json[] } }

    expect(Object.keys(data).sort()).toEqual(
      ["description", "generatedAt", "incidents", "monitors", "state", "title"].sort(),
    )
    expect(data.state).toBe("down")
    expect(data.monitors.map((m) => m.name).sort()).toEqual(["billing", "etl"])
    for (const m of data.monitors) {
      expect(Object.keys(m).sort()).toEqual(["days", "name", "state", "uptime"])
      expect((m.days as unknown[]).length).toBe(90)
    }
    expect(data.incidents).toHaveLength(1)
    expect(Object.keys(data.incidents[0] ?? {}).sort()).toEqual([
      "monitor",
      "resolvedAt",
      "startedAt",
    ])

    // Nothing internal anywhere in the payload.
    for (const secret of [
      "secret-token",
      "SECRET OUTPUT",
      "hunter2",
      "10.9.8.7",
      etl.id,
      "staging",
      "internal",
    ]) {
      expect(raw).not.toContain(secret)
    }
  })

  it("stops serving a page as soon as it is disabled", async () => {
    const res = await admin("POST", "/api/status-pages", {
      slug: "p",
      title: "P",
      tag: "x",
      enabled: true,
    })
    const id = (((await res.json()) as { data: Json }).data.id as string) ?? ""
    expect((await pub("p")).status).toBe(200)
    await admin("PATCH", `/api/status-pages/${id}`, { enabled: false })
    expect((await pub("p")).status).toBe(404)
    expect((await admin("DELETE", `/api/status-pages/${id}`)).status).toBe(200)
    expect((await admin("DELETE", `/api/status-pages/${id}`)).status).toBe(404)
  })
})
