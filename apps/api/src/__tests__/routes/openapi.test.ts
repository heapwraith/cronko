import { readFileSync } from "node:fs"
import { resolve } from "node:path"
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

  it("reports the same version as the API package", async () => {
    const pkg = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "../../../package.json"), "utf8"),
    ) as { version: string }
    const body = (await (await app.request("/openapi.json")).json()) as {
      info: { version: string }
    }
    expect(body.info.version).toBe(pkg.version)
  })

  it("GET /docs returns Scalar UI HTML", async () => {
    const res = await app.request("/docs")
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain("scalar")
  })
})
