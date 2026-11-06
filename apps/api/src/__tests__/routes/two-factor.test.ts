import { Hono } from "hono"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { setupTestDb } from "../helpers/testDb"

const EMAIL = "ops@example.com"
const PASSWORD = "pw-12345678"

type Res = Omit<Response, "json"> & { json(): Promise<any> }

function cookieValue(res: Res, name: string): string | undefined {
  for (const line of res.headers.getSetCookie()) {
    const m = line.match(new RegExp(`^${name}=([^;]*)`))
    if (m) return m[1] || undefined
  }
  return undefined
}

describe("two-factor authentication (real SQLite)", () => {
  let app: Hono
  let hotp: typeof import("../../services/totp").hotp
  let base32Decode: typeof import("../../services/totp").base32Decode
  let totpStep: typeof import("../../services/totp").totpStep
  let sql: (q: string) => unknown

  beforeAll(async () => {
    await setupTestDb()
    const { sqliteClient } = await import("@cronko/database")
    sql = (q) => sqliteClient.prepare(q).all()
    const { createUser } = await import("@cronko/database/queries/users")
    const auth = await import("../../services/auth")
    const totp = await import("../../services/totp")
    hotp = totp.hotp
    base32Decode = totp.base32Decode
    totpStep = totp.totpStep
    const { authRoute } = await import("../../routes/auth")
    const { authenticate } = await import("../../middleware/authenticate")
    await createUser({ email: EMAIL, passwordHash: await auth.hashPassword(PASSWORD) })
    app = new Hono()
    app.route("/auth", authRoute)
    app.get("/api/ping-check", authenticate, (c) => c.json({ ok: true }))
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-06T12:00:00Z"))
  })

  afterAll(() => vi.useRealTimers())

  const send = (
    method: string,
    path: string,
    headers: Record<string, string>,
    body?: unknown,
  ): Promise<Res> =>
    Promise.resolve(
      app.request(path, {
        method,
        headers: { "content-type": "application/json", ...headers },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    )
  const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
    send("POST", path, headers, body)

  const codeFor = (secret: string, offsetSteps = 0) =>
    hotp(base32Decode(secret), totpStep(Date.now()) + offsetSteps)
  const advance = (seconds: number) => vi.setSystemTime(new Date(Date.now() + seconds * 1000))

  async function session() {
    const res = await post("/auth/login", { email: EMAIL, password: PASSWORD })
    return { Authorization: `Bearer ${(await res.json()).data.token}` }
  }

  let secret = ""
  let recoveryCodes: string[] = []
  let headers: Record<string, string> = {}

  it("starts disabled and refuses enable before setup", async () => {
    headers = await session()
    const status = await send("GET", "/auth/2fa", headers)
    expect((await status.json()).data).toEqual({ enabled: false, recoveryCodesRemaining: 0 })
    expect((await post("/auth/2fa/enable", { code: "123456" }, headers)).status).toBe(400)
  })

  it("requires authentication for every management route", async () => {
    expect((await send("GET", "/auth/2fa", {})).status).toBe(401)
    expect((await post("/auth/2fa/setup")).status).toBe(401)
  })

  it("setup returns an otpauth URI and the secret, stored encrypted", async () => {
    const res = await post("/auth/2fa/setup", undefined, headers)
    expect(res.status).toBe(200)
    const data = (await res.json()).data
    secret = data.secret
    expect(secret).toMatch(/^[A-Z2-7]{32}$/)
    expect(data.otpauthUri).toContain(`secret=${secret}`)
    expect(data.otpauthUri).toContain("otpauth://totp/Cronko:")

    const rows = sql("SELECT totp_secret, totp_enabled_at FROM users") as {
      totp_secret: string
      totp_enabled_at: number | null
    }[]
    expect(rows[0]?.totp_secret).toBeTruthy()
    expect(rows[0]?.totp_secret).not.toContain(secret)
    expect(rows[0]?.totp_enabled_at).toBeNull()
  })

  it("a pending setup does not change login", async () => {
    const res = await post("/auth/login", { email: EMAIL, password: PASSWORD })
    expect((await res.json()).data.token).toBeTruthy()
  })

  it("enable rejects a wrong code, then accepts the right one and returns 10 recovery codes", async () => {
    const wrong = codeFor(secret) === "000000" ? "111111" : "000000"
    expect((await post("/auth/2fa/enable", { code: wrong }, headers)).status).toBe(400)

    const res = await post("/auth/2fa/enable", { code: codeFor(secret) }, headers)
    expect(res.status).toBe(200)
    recoveryCodes = (await res.json()).data.recoveryCodes
    expect(recoveryCodes).toHaveLength(10)

    const stored = sql("SELECT code_hash FROM recovery_codes") as { code_hash: string }[]
    expect(stored).toHaveLength(10)
    for (const code of recoveryCodes) expect(JSON.stringify(stored)).not.toContain(code)

    expect((await post("/auth/2fa/setup", undefined, headers)).status).toBe(409)
    expect((await post("/auth/2fa/enable", { code: codeFor(secret) }, headers)).status).toBe(409)
  })

  it("password alone no longer logs in: no cookies, only a challenge", async () => {
    const res = await post("/auth/login", { email: EMAIL, password: PASSWORD })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.twoFactorRequired).toBe(true)
    expect(body.data.token).toBeUndefined()
    expect(cookieValue(res, "cronko_token")).toBeUndefined()
    expect(cookieValue(res, "cronko_refresh")).toBeUndefined()
  })

  async function challenge() {
    const res = await post("/auth/login", { email: EMAIL, password: PASSWORD })
    return (await res.json()).data.challenge as string
  }

  it("the challenge is not a session token", async () => {
    const ch = await challenge()
    const res = await app.request("/api/ping-check", { headers: { Authorization: `Bearer ${ch}` } })
    expect(res.status).toBe(401)
  })

  it("rejects a wrong code and a forged challenge", async () => {
    const ch = await challenge()
    expect((await post("/auth/login/2fa", { challenge: ch, code: "000000" })).status).toBe(401)
    expect(
      (await post("/auth/login/2fa", { challenge: "nope", code: codeFor(secret) })).status,
    ).toBe(401)
  })

  it("the enrollment code cannot be replayed within its time step", async () => {
    // enable consumed the current step, so the same code is refused at login
    const ch = await challenge()
    const res = await post("/auth/login/2fa", { challenge: ch, code: codeFor(secret) })
    expect(res.status).toBe(401)
  })

  it("a valid code completes login with cookies, exactly once per time step", async () => {
    advance(30)
    const code = codeFor(secret)
    const res = await post("/auth/login/2fa", { challenge: await challenge(), code })
    expect(res.status).toBe(200)
    expect(cookieValue(res, "cronko_token")).toBeTruthy()
    expect(cookieValue(res, "cronko_refresh")).toBeTruthy()

    // same code, same step: replay
    const replay = await post("/auth/login/2fa", { challenge: await challenge(), code })
    expect(replay.status).toBe(401)

    // an older step inside the window is also not newer than the last accepted one
    const older = await post("/auth/login/2fa", {
      challenge: await challenge(),
      code: codeFor(secret, -1),
    })
    expect(older.status).toBe(401)
  })

  it("accepts the next step's code and tolerates spaces", async () => {
    advance(30)
    const c = codeFor(secret)
    const res = await post("/auth/login/2fa", {
      challenge: await challenge(),
      code: `${c.slice(0, 3)} ${c.slice(3)}`,
    })
    expect(res.status).toBe(200)
  })

  it("a recovery code logs in once and is then dead", async () => {
    const code = recoveryCodes[0] as string
    const res = await post("/auth/login/2fa", { challenge: await challenge(), code })
    expect(res.status).toBe(200)
    expect(cookieValue(res, "cronko_refresh")).toBeTruthy()

    const reuse = await post("/auth/login/2fa", { challenge: await challenge(), code })
    expect(reuse.status).toBe(401)

    const status = await send("GET", "/auth/2fa", await session2fa())
    expect((await status.json()).data.recoveryCodesRemaining).toBe(9)
  })

  async function session2fa() {
    advance(30)
    const res = await post("/auth/login/2fa", {
      challenge: await challenge(),
      code: codeFor(secret),
    })
    expect(res.status).toBe(200)
    return { Authorization: `Bearer ${(await res.json()).data.token}` }
  }

  it("an expired challenge is refused", async () => {
    const ch = await challenge()
    advance(6 * 60)
    const res = await post("/auth/login/2fa", { challenge: ch, code: codeFor(secret) })
    expect(res.status).toBe(401)
  })

  it("API tokens keep working without 2FA but cannot manage it", async () => {
    headers = await session2fa()
    // The tokens route lives in the API app, not here: insert one directly.
    const { createApiToken } = await import("@cronko/database/queries/api-tokens")
    const { generateApiToken } = await import("../../services/api-tokens")
    const { token, hash, prefix } = generateApiToken()
    const userId = ((sql("SELECT id FROM users") as { id: string }[])[0] as { id: string }).id
    await createApiToken({
      id: crypto.randomUUID(),
      userId,
      name: "ci",
      prefix,
      tokenHash: hash,
      scope: "read",
      createdAt: new Date(),
    })

    const ok = await app.request("/api/ping-check", {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(ok.status).toBe(200)

    const status = await send("GET", "/auth/2fa", { Authorization: `Bearer ${token}` })
    expect(status.status).toBe(403)
    const setup = await post("/auth/2fa/setup", undefined, { Authorization: `Bearer ${token}` })
    expect(setup.status).toBe(403)
  })

  it("the 2FA step shares the failure limiter: 5 wrong codes lock it, even for the right one", async () => {
    // Fresh limiter state is not available; other tests already recorded failures.
    // Burn attempts until blocked, then prove the right code is refused with 429.
    const ch = await challenge()
    let blocked = false
    for (let i = 0; i < 6 && !blocked; i++) {
      const res = await post("/auth/login/2fa", { challenge: ch, code: "000000" })
      blocked = res.status === 429
    }
    expect(blocked).toBe(true)
    advance(30)
    const right = await post("/auth/login/2fa", { challenge: ch, code: codeFor(secret) })
    expect(right.status).toBe(429)
    // the password step is locked by the same counter
    expect((await post("/auth/login", { email: EMAIL, password: PASSWORD })).status).toBe(429)
  })

  it("disable needs the password and a valid code (limiter window must pass first)", async () => {
    advance(16 * 60) // limiter window (15 min) expires, challenge irrelevant here
    headers = await session2fa()
    const bad = await post(
      "/auth/2fa/disable",
      { password: "nope", code: codeFor(secret) },
      headers,
    )
    expect(bad.status).toBe(401)
    advance(30)
    const badCode = await post("/auth/2fa/disable", { password: PASSWORD, code: "000000" }, headers)
    expect(badCode.status).toBe(401)
    expect((await send("GET", "/auth/2fa", headers).then((r) => r.json())).data.enabled).toBe(true)

    advance(30)
    const ok = await post(
      "/auth/2fa/disable",
      { password: PASSWORD, code: codeFor(secret) },
      headers,
    )
    expect(ok.status).toBe(200)
    expect((await send("GET", "/auth/2fa", headers).then((r) => r.json())).data).toEqual({
      enabled: false,
      recoveryCodesRemaining: 0,
    })
    expect(sql("SELECT * FROM recovery_codes")).toHaveLength(0)
    expect(sql("SELECT totp_secret FROM users")).toEqual([{ totp_secret: null }])
  })

  it("after disabling, password-only login issues cookies again", async () => {
    const res = await post("/auth/login", { email: EMAIL, password: PASSWORD })
    expect(cookieValue(res, "cronko_token")).toBeTruthy()
  })

  it("disable can use a recovery code instead of a TOTP code", async () => {
    headers = await session()
    const s = (await (await post("/auth/2fa/setup", undefined, headers)).json()).data.secret
    advance(30)
    const codes = (await (await post("/auth/2fa/enable", { code: codeFor(s) }, headers)).json())
      .data.recoveryCodes as string[]
    const res = await post("/auth/2fa/disable", { password: PASSWORD, code: codes[3] }, headers)
    expect(res.status).toBe(200)
  })
})
