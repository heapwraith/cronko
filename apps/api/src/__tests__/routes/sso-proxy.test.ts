import type { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { setupTestDb } from "../helpers/testDb"

// The TCP peer is what a trusted-proxy check looks at; tests choose it per request.
const conn = vi.hoisted(() => ({ peer: "10.0.0.5" as string | undefined }))
vi.mock("@hono/node-server/conninfo", () => ({
  getConnInfo: () => ({ remote: { address: conn.peer } }),
}))

describe("trusted-proxy sign-in and password login switch (real SQLite)", () => {
  let app: Hono

  beforeAll(async () => {
    process.env.TRUSTED_PROXY_AUTH_HEADER = "Remote-Email"
    process.env.TRUSTED_PROXY_IPS = "10.0.0.0/8, 192.168.1.10, fd00::/8"
    process.env.PASSWORD_LOGIN_DISABLED = "true"
    // Even with TRUST_PROXY on, forwarded headers must not make a peer trusted.
    process.env.TRUST_PROXY = "true"
    await setupTestDb()
    ;({ app } = (await import("../../app")) as unknown as { app: Hono })
    const { createUser } = await import("@cronko/database/queries/users")
    const { hashPassword } = await import("../../services/auth")
    await createUser({ email: "ops@example.com", passwordHash: await hashPassword("pw-123456") })
  })

  let visitor = 0
  beforeEach(() => {
    conn.peer = "10.0.0.5"
    visitor++
  })

  const viaProxy = (headers: Record<string, string> = { "remote-email": "ops@example.com" }) =>
    app.request("/auth/sso/proxy", {
      headers: { "x-forwarded-for": `203.0.113.${visitor}`, ...headers },
    })
  const sessionCookies = (res: Response) =>
    (res.headers.getSetCookie?.() ?? []).filter((c) => c.startsWith("cronko_token="))

  it("advertises proxy login and a disabled password form", async () => {
    const res = await app.request("/auth/sso/config")
    expect(await res.json()).toEqual({ data: { oidc: false, proxy: true, passwordLogin: false } })
  })

  it("signs in the user named by the header when the peer is a trusted proxy", async () => {
    const res = await viaProxy()
    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toBe("/")
    expect(sessionCookies(res)).toHaveLength(1)
  })

  it.each([
    ["10.255.255.254", "inside a trusted CIDR"],
    ["192.168.1.10", "a single trusted address"],
    ["::ffff:10.1.2.3", "an IPv4-mapped IPv6 peer"],
    ["fd00::1", "an IPv6 CIDR"],
  ])("trusts %s (%s)", async (peer) => {
    conn.peer = peer
    expect((await viaProxy()).headers.get("location")).toBe("/")
  })

  it.each<[string | undefined, string]>([
    ["203.0.113.9", "an outside address"],
    ["192.168.1.11", "a neighbour of a trusted address"],
    ["11.0.0.1", "just outside the CIDR"],
    ["not-an-ip", "garbage"],
    [undefined, "an unknown peer"],
  ])("ignores the header from %s (%s)", async (peer, _why) => {
    conn.peer = peer
    const res = await viaProxy()
    expect(res.headers.get("location")).toBe("/login?sso_error=untrusted_proxy")
    expect(sessionCookies(res)).toHaveLength(0)
  })

  it("cannot be spoofed with forwarded headers from an untrusted peer", async () => {
    conn.peer = "203.0.113.50"
    const res = await viaProxy({
      "remote-email": "ops@example.com",
      "x-forwarded-for": "10.0.0.5",
      "x-real-ip": "10.0.0.5",
    })
    expect(res.headers.get("location")).toBe("/login?sso_error=untrusted_proxy")
    expect(sessionCookies(res)).toHaveLength(0)
  })

  it("refuses a missing header and a user that does not exist", async () => {
    const none = await viaProxy({})
    expect(none.headers.get("location")).toBe("/login?sso_error=no_identity")
    const stranger = await viaProxy({ "remote-email": "stranger@example.com" })
    expect(stranger.headers.get("location")).toBe("/login?sso_error=not_allowed")
    expect(sessionCookies(stranger)).toHaveLength(0)
  })

  it("rate limits repeated failures from one address", async () => {
    const headers = { "x-forwarded-for": "198.51.100.77" }
    conn.peer = "203.0.113.50"
    for (let i = 0; i < 5; i++) {
      const r = await app.request("/auth/sso/proxy", { headers })
      expect(r.headers.get("location")).toBe("/login?sso_error=untrusted_proxy")
    }
    const blocked = await app.request("/auth/sso/proxy", { headers })
    expect(blocked.headers.get("location")).toBe("/login?sso_error=rate_limited")
  })

  it("turns the password form off: login and the 2FA step answer 403", async () => {
    const login = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ email: "ops@example.com", password: "pw-123456" }),
    })
    expect(login.status).toBe(403)
    expect(((await login.json()) as { code: string }).code).toBe("PASSWORD_LOGIN_DISABLED")
    expect(sessionCookies(login)).toHaveLength(0)

    const second = await app.request("/auth/login/2fa", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ challenge: "x", code: "123456" }),
    })
    expect(second.status).toBe(403)
  })

  it("keeps the OIDC endpoints off when OIDC is not configured", async () => {
    expect((await app.request("/auth/sso/oidc/start")).status).toBe(404)
    expect((await app.request("/auth/sso/oidc/callback?code=x&state=y")).status).toBe(404)
  })
})
