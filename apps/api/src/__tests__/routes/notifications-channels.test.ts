import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setupTestDb } from "../helpers/testDb"

describe("notification channel validation (HTTP, real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let app: Hono

  beforeAll(async () => {
    ctx = await setupTestDb()
    const { notificationsRoute } = await import("../../routes/notifications")
    app = new Hono().route("/api/notifications", notificationsRoute)
  })
  beforeEach(() => ctx.reset())

  const create = (body: unknown) =>
    app.request("/api/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })

  it("creates a generic webhook (http allowed for internal hosts)", async () => {
    const res = await create({
      name: "n8n",
      type: "webhook",
      config: { url: "http://n8n:5678/hook" },
    })
    expect(res.status).toBe(201)
  })

  it("rejects a webhook with a non-http URL", async () => {
    const res = await create({ name: "x", type: "webhook", config: { url: "ftp://x/y" } })
    expect(res.status).toBe(400)
  })

  it("creates ntfy with only a topic, or with server and token", async () => {
    expect((await create({ name: "a", type: "ntfy", config: { topic: "cronko" } })).status).toBe(
      201,
    )
    const full = await create({
      name: "b",
      type: "ntfy",
      config: { topic: "ops_alerts", serverUrl: "https://ntfy.example.com", token: "tk_1" },
    })
    expect(full.status).toBe(201)
    const blank = await create({
      name: "c",
      type: "ntfy",
      config: { topic: "ops", serverUrl: "", token: "" },
    })
    expect(blank.status).toBe(201)
  })

  it("rejects an ntfy topic with spaces or slashes", async () => {
    expect((await create({ name: "x", type: "ntfy", config: { topic: "a b" } })).status).toBe(400)
    expect((await create({ name: "x", type: "ntfy", config: { topic: "a/b" } })).status).toBe(400)
  })

  it("validates Pushover keys and Teams webhook URLs", async () => {
    const ok = "A1".repeat(15)
    expect(
      (await create({ name: "p", type: "pushover", config: { appToken: ok, userKey: ok } })).status,
    ).toBe(201)
    expect(
      (await create({ name: "p", type: "pushover", config: { appToken: "short", userKey: ok } }))
        .status,
    ).toBe(400)
    expect(
      (await create({ name: "t", type: "teams", config: { webhookUrl: "https://x.example/y" } }))
        .status,
    ).toBe(201)
    expect(
      (await create({ name: "t", type: "teams", config: { webhookUrl: "nope" } })).status,
    ).toBe(400)
  })

  it("validates the PagerDuty routing key", async () => {
    const pd = (routingKey: string) =>
      create({ name: "pd", type: "pagerduty", config: { routingKey } })
    expect((await pd("a1".repeat(16))).status).toBe(201)
    expect((await pd("too-short")).status).toBe(400)
  })
})
