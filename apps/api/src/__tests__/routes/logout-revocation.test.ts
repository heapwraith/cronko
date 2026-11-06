import { Hono } from "hono"
import { beforeAll, describe, expect, it } from "vitest"
import { setupTestDb } from "../helpers/testDb"

/** Pull `name=value` out of the Set-Cookie headers of a response. */
function cookieValue(res: Response, name: string): string | undefined {
  for (const line of res.headers.getSetCookie()) {
    const m = line.match(new RegExp(`^${name}=([^;]*)`))
    if (m) return m[1] || undefined
  }
  return undefined
}

describe("logout revokes the session server-side (real SQLite)", () => {
  let app: Hono

  beforeAll(async () => {
    await setupTestDb()
    const { createUser } = await import("@cronko/database/queries/users")
    const { hashPassword } = await import("../../services/auth")
    const { authRoute } = await import("../../routes/auth")
    const { authenticate } = await import("../../middleware/authenticate")
    await createUser({ email: "ops@example.com", passwordHash: await hashPassword("pw-12345678") })
    app = new Hono()
    app.route("/auth", authRoute)
    app.get("/protected", authenticate, (c) => c.json({ ok: true }))
  })

  const post = (path: string, headers: Record<string, string> = {}, body?: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

  async function signIn() {
    const res = await post("/auth/login", {}, { email: "ops@example.com", password: "pw-12345678" })
    expect(res.status).toBe(200)
    return {
      access: cookieValue(res, "cronko_token")!,
      refresh: cookieValue(res, "cronko_refresh")!,
    }
  }

  it("refresh works before logout", async () => {
    const { refresh } = await signIn()
    expect((await post("/auth/refresh", { cookie: `cronko_refresh=${refresh}` })).status).toBe(200)
  })

  it("the refresh token and the access token are dead after logout", async () => {
    const { access, refresh } = await signIn()
    const cookie = `cronko_token=${access}; cronko_refresh=${refresh}`
    expect((await app.request("/protected", { headers: { cookie } })).status).toBe(200)

    expect((await post("/auth/logout", { cookie })).status).toBe(200)

    expect((await post("/auth/refresh", { cookie: `cronko_refresh=${refresh}` })).status).toBe(401)
    expect((await app.request("/protected", { headers: { cookie } })).status).toBe(401)
    expect(
      (await app.request("/protected", { headers: { Authorization: `Bearer ${access}` } })).status,
    ).toBe(401)
  })

  it("logging out with an expired access token still revokes the refresh token", async () => {
    const { refresh } = await signIn()
    const res = await post("/auth/logout", {
      cookie: `cronko_token=garbage; cronko_refresh=${refresh}`,
    })
    expect(res.status).toBe(200)
    expect((await post("/auth/refresh", { cookie: `cronko_refresh=${refresh}` })).status).toBe(401)
  })

  it("only the logged-out session is revoked, other sessions keep working", async () => {
    const a = await signIn()
    const b = await signIn()
    await post("/auth/logout", { cookie: `cronko_refresh=${a.refresh}` })
    expect((await post("/auth/refresh", { cookie: `cronko_refresh=${b.refresh}` })).status).toBe(
      200,
    )
  })

  it("is idempotent without any cookie", async () => {
    expect((await post("/auth/logout")).status).toBe(200)
  })
})
