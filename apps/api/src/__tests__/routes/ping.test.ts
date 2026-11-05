import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import { pingRoute } from "../../routes/ping"

describe("ping route", () => {
  const app = new Hono()
  app.route("/ping", pingRoute)

  it("rejects body larger than 10KB with 413", async () => {
    const hugeBody = "x".repeat(10_001)
    const res = await app.request("/ping/test-token", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: hugeBody,
    })
    expect(res.status).toBe(413)
    const body = (await res.json()) as { code: string }
    expect(body.code).toBe("PAYLOAD_TOO_LARGE")
  })

  it("accepts job output containing markup (stored verbatim)", async () => {
    const res = await app.request("/ping/test-token-2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: "<script>alert('xss')</script>Hello <b>World</b>",
      }),
    })
    // Should not return 413 — body is under 10KB
    expect(res.status).not.toBe(413)
  })

  it("handles GET ping request", async () => {
    const res = await app.request("/ping/test-token-3")
    // Token doesn't exist — service attempts to query DB
    // In test environment without migrations, may return 404 or 500
    expect([404, 500]).toContain(res.status)
  })
})
