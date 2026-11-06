import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setupTestDb } from "../helpers/testDb"

describe("webhook headers and template (HTTP, real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let app: Hono

  beforeAll(async () => {
    ctx = await setupTestDb()
    const { notificationsRoute } = await import("../../routes/notifications")
    app = new Hono().route("/api/notifications", notificationsRoute)
  })
  beforeEach(() => ctx.reset())

  const send = (method: string, path: string, body: unknown) =>
    app.request(`/api/notifications${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })

  it("rejects unknown placeholders and bad headers at save time", async () => {
    const bad = await send("POST", "", {
      name: "w",
      type: "webhook",
      config: { url: "http://h/x", bodyTemplate: "{{nope}}" },
    })
    expect(bad.status).toBe(400)
    const badHeader = await send("POST", "", {
      name: "w",
      type: "webhook",
      config: { url: "http://h/x", headers: "Host: x" },
    })
    expect(badHeader.status).toBe(400)
  })

  it("never echoes header values in full and keeps them across an edit", async () => {
    const res = await send("POST", "", {
      name: "w",
      type: "webhook",
      config: { url: "http://h/x", headers: "Authorization: Bearer topsecret1234" },
    })
    expect(res.status).toBe(201)
    const created = ((await res.json()) as { data: { id: string } }).data
    expect(JSON.stringify(created)).not.toContain("topsecret")

    const list = (await (await app.request("/api/notifications")).json()) as {
      data: { config: { headers: string } }[]
    }
    expect(JSON.stringify(list)).not.toContain("topsecret")
    const masked = list.data[0]?.config.headers ?? ""

    const patch = await send("PATCH", `/${created.id}`, {
      config: { url: "http://h/y", headers: masked },
    })
    expect(patch.status).toBe(200)
    const { findNotificationChannelById } = await import("@cronko/database/queries/notifications")
    const stored = await findNotificationChannelById(created.id)
    expect((stored?.config as { headers?: string } | undefined)?.headers).toBe(
      "Authorization: Bearer topsecret1234",
    )
  })
})
