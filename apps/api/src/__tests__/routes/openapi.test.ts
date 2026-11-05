import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import { registerOpenApi } from "../../openapi"

describe("OpenAPI", () => {
  const app = new Hono()
  registerOpenApi(app)

  it("GET /openapi.json returns a valid spec", async () => {
    const res = await app.request("/openapi.json")
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      openapi: string
      info: { title: string }
      paths: Record<string, unknown>
    }
    expect(body.openapi).toBe("3.1.0")
    expect(body.info.title).toBe("Cronko")
    expect(Object.keys(body.paths).length).toBeGreaterThan(10)
  })

  it("GET /docs returns Scalar UI HTML", async () => {
    const res = await app.request("/docs")
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain("scalar")
  })
})
