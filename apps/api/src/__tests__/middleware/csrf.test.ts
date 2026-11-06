import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import { csrf } from "../../middleware/csrf"

function app() {
  const a = new Hono()
  a.use("*", csrf)
  a.all("*", (c) => c.json({ ok: true }))
  return a
}

const post = (headers: Record<string, string> = {}) =>
  app().request("http://cronko.test/api/monitors", {
    method: "POST",
    headers: { host: "cronko.test", ...headers },
  })

describe("csrf (fetch metadata + origin)", () => {
  it("never blocks safe methods", async () => {
    const res = await app().request("http://cronko.test/api/monitors", {
      headers: { "sec-fetch-site": "cross-site" },
    })
    expect(res.status).toBe(200)
  })

  it.each(["cross-site", "same-site"])("blocks Sec-Fetch-Site: %s", async (site) => {
    const res = await post({ "sec-fetch-site": site })
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ code: "CSRF_INVALID" })
  })

  it.each(["same-origin", "none"])("allows Sec-Fetch-Site: %s", async (site) => {
    expect((await post({ "sec-fetch-site": site })).status).toBe(200)
  })

  it("falls back to Origin when Sec-Fetch-Site is absent", async () => {
    expect((await post({ origin: "http://cronko.test" })).status).toBe(200)
    expect((await post({ origin: "http://evil.test" })).status).toBe(403)
    expect((await post({ origin: "not a url" })).status).toBe(403)
  })

  it("honours X-Forwarded-Host behind a reverse proxy", async () => {
    const res = await post({
      origin: "https://cronko.example.com",
      "x-forwarded-host": "cronko.example.com",
    })
    expect(res.status).toBe(200)
  })

  it("exempts Authorization (non-cookie) clients, even cross-site", async () => {
    const res = await post({ "sec-fetch-site": "cross-site", authorization: "Bearer x" })
    expect(res.status).toBe(200)
  })

  it("allows non-browser clients that send neither header", async () => {
    expect((await post()).status).toBe(200)
  })
})
