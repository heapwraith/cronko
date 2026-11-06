import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import { rateLimit } from "../../middleware/rateLimit"

describe("rateLimit middleware", () => {
  function createApp() {
    const app = new Hono()
    app.use("/:token", rateLimit)
    app.get("/:token", (c) => c.json({ ok: true }))
    return app
  }

  it("allows requests within limit", async () => {
    const app = createApp()
    const res = await app.request("/test-token-1")
    expect(res.status).toBe(200)
    expect(res.headers.get("X-RateLimit-Limit")).toBe("60")
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("59")
  })

  it("includes rate limit headers", async () => {
    const app = createApp()
    const res = await app.request("/test-token-2")
    expect(res.headers.get("X-RateLimit-Limit")).toBeDefined()
    expect(res.headers.get("X-RateLimit-Remaining")).toBeDefined()
    expect(res.headers.get("X-RateLimit-Reset")).toBeDefined()
  })

  it("returns 429 when limit is exceeded", async () => {
    const app = createApp()
    // Exhaust the limit (60 requests in 60s window)
    for (let i = 0; i < 60; i++) {
      await app.request("/test-token-3")
    }
    const res = await app.request("/test-token-3")
    expect(res.status).toBe(429)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe("RATE_LIMITED")
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0")
  })
})
