import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setupTestDb } from "../helpers/testDb"

type Json = Record<string, any>

describe("scoped API tokens (HTTP, real SQLite)", () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>
  let app: Hono
  let session: string
  let userId: string
  let hashApiToken: typeof import("../../services/api-tokens").hashApiToken
  let tokenQ: typeof import("@cronko/database/queries/api-tokens")

  beforeAll(async () => {
    ctx = await setupTestDb()
    const { authenticate } = await import("../../middleware/authenticate")
    const { settingsRoute } = await import("../../routes/settings")
    const { monitorsRoute } = await import("../../routes/monitors")
    ;({ hashApiToken } = await import("../../services/api-tokens"))
    tokenQ = await import("@cronko/database/queries/api-tokens")
    const users = await import("@cronko/database/queries/users")
    const { generateAccessToken } = await import("../../services/auth")
    await users.createUser({ email: "a@b.co", passwordHash: "x" })
    const user = await users.findUserByEmail("a@b.co")
    userId = user?.id as string
    session = await generateAccessToken(userId, "a@b.co")

    const api = new Hono()
    api.use("*", authenticate)
    api.route("/monitors", monitorsRoute)
    api.route("/settings", settingsRoute)
    app = new Hono().route("/api", api)
  })

  beforeEach(() => ctx.reset())

  const call = (auth: string, method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${auth}` },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })

  async function mint(scope: "read" | "write", extra: Json = {}) {
    const res = await call(session, "POST", "/api/settings/tokens", { name: "ci", scope, ...extra })
    expect(res.status).toBe(201)
    return ((await res.json()) as { data: Json }).data
  }

  it("shows the secret once, stores only its hash, and lists metadata", async () => {
    const created = await mint("read", { expiresInDays: 30 })
    expect(created.token).toMatch(/^crk_/)
    expect(created.prefix).toBe(created.token.slice(0, 10))
    expect(created.status).toBe("active")
    expect(created.expiresAt).not.toBeNull()

    const stored = await tokenQ.findApiTokenByHash(hashApiToken(created.token))
    expect(stored?.id).toBe(created.id)
    expect(stored?.tokenHash).not.toContain(created.token)

    const list = (await (await call(session, "GET", "/api/settings/tokens")).json()) as {
      data: Json[]
    }
    expect(list.data).toHaveLength(1)
    expect(JSON.stringify(list)).not.toContain(created.token)
    expect(list.data[0]?.lastUsedAt).toBeNull()
  })

  it("validates the request", async () => {
    const res = await call(session, "POST", "/api/settings/tokens", { name: "", scope: "admin" })
    expect(res.status).toBe(400)
  })

  it("read token: GET works and records last use, writes are refused", async () => {
    const { token } = await mint("read")
    expect((await call(token, "GET", "/api/monitors")).status).toBe(200)
    const post = await call(token, "POST", "/api/monitors", {
      name: "x",
      expectedIntervalSeconds: 3600,
    })
    expect(post.status).toBe(403)
    expect(((await post.json()) as Json).code).toBe("FORBIDDEN")

    const row = await tokenQ.findApiTokenByHash(hashApiToken(token))
    expect(row?.lastUsedAt).toBeInstanceOf(Date)
  })

  it("write token: manages monitors but not tokens or settings", async () => {
    const { token } = await mint("write")
    const created = await call(token, "POST", "/api/monitors", {
      name: "etl",
      expectedIntervalSeconds: 3600,
    })
    expect(created.status).toBe(201)
    expect((await call(token, "GET", "/api/monitors")).status).toBe(200)
    expect((await call(token, "POST", "/api/settings", { instanceName: "Hax" })).status).toBe(403)
    expect((await call(token, "GET", "/api/settings/tokens")).status).toBe(403)
    expect(
      (await call(token, "POST", "/api/settings/tokens", { name: "n", scope: "write" })).status,
    ).toBe(403)
  })

  it("revoked token is rejected and revoking is audited", async () => {
    const { token, id } = await mint("write")
    expect((await call(session, "DELETE", `/api/settings/tokens/${id}`)).status).toBe(200)
    expect((await call(token, "GET", "/api/monitors")).status).toBe(401)
    expect((await call(session, "DELETE", "/api/settings/tokens/nope")).status).toBe(404)

    const list = (await (await call(session, "GET", "/api/settings/tokens")).json()) as {
      data: Json[]
    }
    expect(list.data[0]?.status).toBe("revoked")

    await new Promise((r) => setTimeout(r, 20))
    const { db } = await import("@cronko/database")
    const { auditLogs } = await import("@cronko/database/schema")
    const actions = (await db.select().from(auditLogs).all()).map((r) => r.action)
    expect(actions).toContain("api_token.created")
    expect(actions).toContain("api_token.revoked")
  })

  it("expired token is rejected and shown as expired", async () => {
    const { token, id } = await mint("read", { expiresInDays: 1 })
    const { db } = await import("@cronko/database")
    const { apiTokens } = await import("@cronko/database/schema")
    const { eq } = await import("drizzle-orm")
    await db
      .update(apiTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(apiTokens.id, id))
    expect((await call(token, "GET", "/api/monitors")).status).toBe(401)
    const list = (await (await call(session, "GET", "/api/settings/tokens")).json()) as {
      data: Json[]
    }
    expect(list.data[0]?.status).toBe("expired")
  })

  it("unknown crk_ token is rejected", async () => {
    expect((await call("crk_nope", "GET", "/api/monitors")).status).toBe(401)
  })
})
