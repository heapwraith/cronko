import { Hono } from "hono"
import { describe, expect, it } from "vitest"

describe("health endpoints", () => {
  const app = new Hono()
  app.get("/health", (c) => c.json({ ok: true, uptime: process.uptime() }))
  app.get("/health/live", (c) => c.json({ status: "ok" }))

  it("GET /health returns 200 with uptime", async () => {
    const res = await app.request("/health")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { ok: boolean; uptime: number }
    expect(body.ok).toBe(true)
    expect(typeof body.uptime).toBe("number")
  })

  it("GET /health/live returns 200", async () => {
    const res = await app.request("/health/live")
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe("ok")
  })
})
