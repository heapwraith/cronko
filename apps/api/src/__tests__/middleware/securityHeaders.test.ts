import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import { securityHeaders } from "../../middleware/securityHeaders"

describe("securityHeaders middleware", () => {
  const app = new Hono()
  app.use("*", securityHeaders)
  app.get("/test", (c) => c.json({ ok: true }))

  it("sets X-Content-Type-Options header", async () => {
    const res = await app.request("/test")
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff")
  })

  it("sets X-Frame-Options header", async () => {
    const res = await app.request("/test")
    expect(res.headers.get("X-Frame-Options")).toBe("DENY")
  })

  it("sets Referrer-Policy header", async () => {
    const res = await app.request("/test")
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin")
  })

  it("sets Content-Security-Policy header", async () => {
    const res = await app.request("/test")
    const csp = res.headers.get("Content-Security-Policy")
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("style-src 'self' 'unsafe-inline'")
  })

  it("sets Permissions-Policy header", async () => {
    const res = await app.request("/test")
    expect(res.headers.get("Permissions-Policy")).toContain("camera=()")
  })
})
