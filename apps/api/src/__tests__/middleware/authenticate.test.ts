import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import { authenticate } from "../../middleware/authenticate"

describe("authenticate middleware", () => {
  const app = new Hono()
  app.use("/api/*", authenticate)
  app.get("/api/protected", (c) => c.json({ ok: true }))

  it("returns 401 when no token is provided", async () => {
    const res = await app.request("/api/protected")
    expect(res.status).toBe(401)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe("UNAUTHORIZED")
  })

  it("returns 401 with invalid token", async () => {
    const res = await app.request("/api/protected", {
      headers: { Authorization: "Bearer invalid-token" },
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe("UNAUTHORIZED")
  })
})
