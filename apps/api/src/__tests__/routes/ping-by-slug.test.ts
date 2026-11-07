import type { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { setupTestDb } from "../helpers/testDb"

vi.mock("../../services/notifier", () => ({
  sendNotification: async () => {},
  processDueDeliveries: async () => 0,
  cleanupDeliveries: async () => {},
  appLink: () => undefined,
}))

type Json = Record<string, unknown>

describe("ping by slug with the instance ping key (full app, real SQLite)", () => {
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

  const admin = (
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

  const newKey = async () =>
    (((await (await admin("POST", "/api/settings/ping-key/rotate")).json()) as Json).data as Json)
      .key as string
  const ping = (key: string, rest: string, init?: RequestInit) =>
    app.request(`/ping/k/${key}/${rest}`, init)

  async function seed(name: string, status = "healthy") {
    const m = await monitors.createMonitor({
      id: crypto.randomUUID(),
      name,
      slug: name,
      token: crypto.randomUUID(),
      expectedIntervalSeconds: 3600,
      gracePeriodSeconds: 60,
      now: new Date(),
    })
    await monitors.transitionMonitorStatus(m.id, "pending", status as never)
    return m
  }

  it("is off until a key is generated, and shows or rotates it for a session only", async () => {
    await seed("etl")
    expect((await ping("pk_nothing", "etl")).status).toBe(404)

    expect(
      (((await (await admin("GET", "/api/settings/ping-key")).json()) as Json).data as Json).key,
    ).toBeNull()
    const key = await newKey()
    expect(key).toMatch(/^pk_[A-Za-z0-9_-]{32}$/)
    expect(
      (((await (await admin("GET", "/api/settings/ping-key")).json()) as Json).data as Json).key,
    ).toBe(key)
    expect(
      (await admin("POST", "/api/settings/ping-key/rotate", undefined, { cookie: "" })).status,
    ).toBe(401)

    // API tokens, even with write scope, can neither read nor rotate it.
    const created = (await (
      await admin("POST", "/api/settings/tokens", { name: "ci", scope: "write" })
    ).json()) as {
      data: { token: string }
    }
    const bearer = { Authorization: `Bearer ${created.data.token}`, cookie: "" }
    expect((await admin("GET", "/api/settings/ping-key", undefined, bearer)).status).toBe(403)
    expect((await admin("POST", "/api/settings/ping-key/rotate", undefined, bearer)).status).toBe(
      403,
    )
  })

  it("pings an existing monitor by slug, with the same suffixes as the token URL", async () => {
    const m = await seed("etl", "missed")
    const key = await newKey()
    expect((await ping(key, "etl")).status).toBe(200)
    expect((await monitors.findMonitorById(m.id))?.status).toBe("healthy")

    expect((await ping(key, "etl/fail")).status).toBe(200)
    expect((await monitors.findMonitorById(m.id))?.status).toBe("failed")
    expect((await ping(key, "etl/0")).status).toBe(200)
    expect((await monitors.findMonitorById(m.id))?.status).toBe("healthy")
    expect((await ping(key, "etl/start")).status).toBe(200)
    expect(
      (
        await ping(key, "etl/log", {
          method: "POST",
          headers: { "content-type": "text/plain" },
          body: "hi",
        })
      ).status,
    ).toBe(200)
    expect((await ping(key, "etl", { method: "POST" })).status).toBe(200)
  })

  it("rotating the key stops the old one at once", async () => {
    await seed("etl")
    const first = await newKey()
    expect((await ping(first, "etl")).status).toBe(200)
    const second = await newKey()
    expect(second).not.toBe(first)
    expect((await ping(first, "etl")).status).toBe(404)
    expect((await ping(second, "etl")).status).toBe(200)
  })

  it("answers an unknown slug 404 and an invalid one 400", async () => {
    const key = await newKey()
    expect((await ping(key, "nope")).status).toBe(404)
    expect((await ping(key, "Bad_Slug")).status).toBe(400)
    expect((await ping(key, "-bad")).status).toBe(400)
  })

  it("creates a monitor on the first ping with ?create=1 and reuses it afterwards", async () => {
    const key = await newKey()
    const res = await ping(key, "nightly-backup?create=1&timeout=7200&grace=300")
    expect(res.status).toBe(200)
    const m = await monitors.findMonitorBySlug("nightly-backup")
    expect(m).toMatchObject({
      name: "nightly-backup",
      expectedIntervalSeconds: 7200,
      gracePeriodSeconds: 300,
      tags: ["auto-created"],
    })
    expect(m?.status).toBe("healthy")

    expect((await ping(key, "nightly-backup?create=1")).status).toBe(200)
    expect(
      (await monitors.findAllMonitors()).filter((x) => x.slug === "nightly-backup"),
    ).toHaveLength(1)
    // Without create=1 an unknown slug is never created.
    expect((await ping(key, "other")).status).toBe(404)
    expect(await monitors.findMonitorBySlug("other")).toBeUndefined()

    const audit = (await (await admin("GET", "/api/audit?limit=20")).json()) as { data: Json[] }
    expect(JSON.stringify(audit)).toContain("monitor.auto_created")
  })

  it("rejects bad timeout or grace values when creating", async () => {
    const key = await newKey()
    expect((await ping(key, "a?create=1&timeout=5")).status).toBe(400)
    expect((await ping(key, "b?create=1&grace=999999")).status).toBe(400)
    expect(await monitors.findMonitorBySlug("a")).toBeUndefined()
  })

  it("caps how many monitors a job can auto-create in total", async () => {
    const key = await newKey()
    for (let i = 0; i < 100; i++) {
      await monitors.createMonitor({
        id: crypto.randomUUID(),
        name: `auto-${i}`,
        slug: `auto-${i}`,
        token: crypto.randomUUID(),
        expectedIntervalSeconds: 3600,
        gracePeriodSeconds: 60,
        tags: ["auto-created"],
        now: new Date(),
      })
    }
    const res = await ping(key, "one-more?create=1")
    expect(res.status).toBe(429)
    expect(((await res.json()) as Json).code).toBe("QUOTA_EXCEEDED")
    expect(await monitors.findMonitorBySlug("one-more")).toBeUndefined()
  })

  it("limits auto-creation per hour", async () => {
    const key = await newKey()
    let blocked = 0
    for (let i = 0; i < 25; i++) {
      const res = await ping(key, `hourly-${i}?create=1`)
      if (res.status === 429) blocked++
    }
    expect(blocked).toBeGreaterThan(0)
    expect(
      (await monitors.findAllMonitors()).filter((m) => m.slug.startsWith("hourly-")).length,
    ).toBeLessThanOrEqual(20)
  })

  it("slows down key guessing per address without blocking a correct key", async () => {
    await seed("etl")
    const key = await newKey()
    let status = 0
    for (let i = 0; i < 40; i++) status = (await ping(`pk_wrong${i}`, "etl")).status
    expect(status).toBe(429)
    expect((await ping(key, "etl")).status).toBe(200)
  })
})
