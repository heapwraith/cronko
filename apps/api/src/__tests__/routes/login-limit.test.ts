import { Hono } from "hono"
import { beforeAll, describe, expect, it } from "vitest"
import { setupTestDb } from "../helpers/testDb"

describe("login rate limit (real SQLite)", () => {
  let app: Hono

  beforeAll(async () => {
    await setupTestDb()
    const { createUser } = await import("@cronko/database/queries/users")
    const { hashPassword } = await import("../../services/auth")
    const { authRoute } = await import("../../routes/auth")
    await createUser({
      email: "ops@example.com",
      passwordHash: await hashPassword("right-password"),
    })
    app = new Hono().route("/auth", authRoute)
  })

  const login = (email: string, password: string) =>
    app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    })

  it("successful logins never count toward the limit", async () => {
    for (let i = 0; i < 12; i++) {
      expect((await login("ops@example.com", "right-password")).status).toBe(200)
    }
  })

  it("blocks after 5 failures, even with the right password, and keeps other accounts open", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await login("ops@example.com", `wrong-${i}`)).status).toBe(401)
    }
    expect((await login("ops@example.com", "right-password")).status).toBe(429)
    // A different account from the same address is tracked separately.
    expect((await login("other@example.com", "whatever")).status).toBe(401)
  })
})
