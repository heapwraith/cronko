import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Hono } from "hono"
import { beforeAll, describe, expect, it, vi } from "vitest"

describe("registerWeb (SPA serving)", () => {
  let app: Hono

  beforeAll(async () => {
    const dir = mkdtempSync(join(tmpdir(), "cronko-web-"))
    mkdirSync(join(dir, "assets"))
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>Cronko</title>")
    writeFileSync(join(dir, "assets", "app-abc123.js"), "console.log(1)")
    vi.stubEnv("WEB_DIST", dir)
    vi.resetModules()

    const { registerWeb } = await import("../web")
    app = new Hono()
    app.get("/health", (c) => c.json({ ok: true }))
    registerWeb(app)
  })

  it("falls back to index.html for client-side routes", async () => {
    const res = await app.request("/monitors/123")
    expect(res.status).toBe(200)
    expect(await res.text()).toContain("<title>Cronko</title>")
    expect(res.headers.get("cache-control")).toBe("no-cache")
  })

  it("caches fingerprinted assets forever", async () => {
    const res = await app.request("/assets/app-abc123.js")
    expect(res.status).toBe(200)
    expect(res.headers.get("cache-control")).toContain("immutable")
  })

  it("does not shadow API routes registered earlier", async () => {
    const res = await app.request("/health")
    expect(await res.json()).toEqual({ ok: true })
  })

  it("returns JSON 404 (not the SPA) for unknown API paths", async () => {
    for (const path of ["/api/nope", "/auth/nope", "/ping/nope/x"]) {
      const res = await app.request(path)
      expect(res.status).toBe(404)
      expect(res.headers.get("content-type")).toContain("application/json")
    }
  })
})
