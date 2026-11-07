import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { createSoftKey } from "../helpers/softKey"
import { setupTestDb } from "../helpers/testDb"

const EMAIL = "ops@example.com"
const PASSWORD = "pw-12345678"
const ORIGIN = "https://cronko.test"
const RP_ID = "cronko.test"

type Res = Omit<Response, "json"> & { json(): Promise<any> }

describe("security keys as a second factor (software authenticator, real SQLite)", () => {
  let app: Hono
  let hotp: typeof import("../../services/totp").hotp
  let base32Decode: typeof import("../../services/totp").base32Decode
  let totpStep: typeof import("../../services/totp").totpStep
  let sql: (q: string) => any[]
  let exec: (q: string) => void
  let visitor = 0
  let secret = ""
  let headers: Record<string, string> = {}

  beforeAll(async () => {
    process.env.PUBLIC_URL = ORIGIN
    // Each test comes from its own address so the failure limiter does not carry over.
    process.env.TRUST_PROXY = "true"
    await setupTestDb()
    const { sqliteClient } = await import("@cronko/database")
    sql = (q) => sqliteClient.prepare(q).all()
    exec = (q) => void sqliteClient.prepare(q).run()
    const { createUser } = await import("@cronko/database/queries/users")
    const auth = await import("../../services/auth")
    const totp = await import("../../services/totp")
    ;({ hotp, base32Decode, totpStep } = totp)
    const { authRoute } = await import("../../routes/auth")
    await createUser({ email: EMAIL, passwordHash: await auth.hashPassword(PASSWORD) })
    app = new Hono().route("/auth", authRoute)
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-06T12:00:00Z"))
  })

  const send = (method: string, path: string, h: Record<string, string>, body?: unknown) =>
    Promise.resolve(
      app.request(path, {
        method,
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `203.0.113.${visitor}`,
          ...h,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    ) as Promise<Res>
  const post = (path: string, body?: unknown, h: Record<string, string> = {}) =>
    send("POST", path, h, body)
  const advance = (s: number) => vi.setSystemTime(new Date(Date.now() + s * 1000))
  const code = () => hotp(base32Decode(secret), totpStep(Date.now()))

  async function login() {
    return post("/auth/login", { email: EMAIL, password: PASSWORD })
  }
  async function session() {
    const res = await login()
    return { Authorization: `Bearer ${(await res.json()).data.token}` }
  }

  /** Register a key the way the browser would. */
  async function addKey(key: ReturnType<typeof createSoftKey>, name = "YubiKey") {
    const opts = await post("/auth/2fa/webauthn/register/options", undefined, headers)
    expect(opts.status).toBe(200)
    const options = (await opts.json()).data
    return post(
      "/auth/2fa/webauthn/register/verify",
      { name, response: key.register(options) },
      headers,
    )
  }

  const newKey = () => createSoftKey({ rpID: RP_ID, origin: ORIGIN })

  beforeEach(() => {
    visitor++
  })

  it("is refused until the authenticator app is on", async () => {
    headers = await session()
    const res = await post("/auth/2fa/webauthn/register/options", undefined, headers)
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe("SETUP_REQUIRED")

    secret = (await (await post("/auth/2fa/setup", undefined, headers)).json()).data.secret
    expect((await post("/auth/2fa/enable", { code: code() }, headers)).status).toBe(200)
  })

  it("is off for API tokens and anonymous callers", async () => {
    expect((await send("GET", "/auth/2fa/webauthn", {})).status).toBe(401)
  })

  it("registers a key and lists it without any key material", async () => {
    const key = newKey()
    const res = await addKey(key, "Blue key")
    expect(res.status).toBe(201)
    const list = (await (await send("GET", "/auth/2fa/webauthn", headers)).json()).data
    expect(list.available).toBe(true)
    expect(list.credentials).toHaveLength(1)
    expect(list.credentials[0]).toMatchObject({ id: key.id, name: "Blue key", lastUsedAt: null })
    expect(JSON.stringify(list)).not.toMatch(/publicKey|public_key|counter/)
    const row = sql("SELECT public_key, counter FROM webauthn_credentials")[0]
    expect(row.public_key.length).toBeGreaterThan(40)
  })

  it("refuses the same key twice, a wrong origin and a replayed registration", async () => {
    const key = newKey()
    expect((await addKey(key)).status).toBe(201)
    expect((await addKey(key)).status).toBe(400) // excluded / already registered

    const other = newKey()
    const opts = (
      await (await post("/auth/2fa/webauthn/register/options", undefined, headers)).json()
    ).data
    const evil = await post(
      "/auth/2fa/webauthn/register/verify",
      { name: "x", response: other.register(opts, "https://evil.example") },
      headers,
    )
    expect(evil.status).toBe(400)
    // The challenge was spent by that attempt: even a correct answer to it is refused now.
    const late = await post(
      "/auth/2fa/webauthn/register/verify",
      { name: "x", response: other.register(opts) },
      headers,
    )
    expect(late.status).toBe(400)
  })

  describe("login", () => {
    let key: ReturnType<typeof createSoftKey>

    beforeAll(async () => {
      exec("DELETE FROM webauthn_credentials")
    })

    it("offers the key in the second step, next to the code", async () => {
      key = newKey()
      expect((await addKey(key)).status).toBe(201)
      const res = await login()
      const data = (await res.json()).data
      expect(data.twoFactorRequired).toBe(true)
      expect(data.webauthn.challenge).toBeTruthy()
      expect(data.webauthn.allowCredentials.map((c: { id: string }) => c.id)).toEqual([key.id])
      expect(data.webauthn.rpId).toBe(RP_ID)
      expect(data.token).toBeUndefined()
    })

    it("signs in with a valid assertion, once", async () => {
      const data = (await (await login()).json()).data
      const assertion = key.assert(data.webauthn)
      const ok = await post("/auth/login/webauthn", {
        challenge: data.challenge,
        response: assertion,
      })
      expect(ok.status).toBe(200)
      expect((await ok.json()).data.token).toBeTruthy()
      expect(ok.headers.getSetCookie().some((c) => c.startsWith("cronko_token="))).toBe(true)
      const row = sql("SELECT counter, last_used_at FROM webauthn_credentials")[0]
      expect(row.counter).toBeGreaterThan(0)
      expect(row.last_used_at).not.toBeNull()

      // The very same answer cannot be sent again.
      const replay = await post("/auth/login/webauthn", {
        challenge: data.challenge,
        response: assertion,
      })
      expect(replay.status).toBe(401)
    })

    it("refuses a bad signature, a wrong origin and a wrong relying party", async () => {
      for (const over of [
        { sign: false },
        { origin: "https://evil.example" },
        { rpID: "evil.example" },
      ]) {
        const data = (await (await login()).json()).data
        const res = await post("/auth/login/webauthn", {
          challenge: data.challenge,
          response: key.assert(data.webauthn, over),
        })
        expect(res.status, JSON.stringify(over)).toBe(401)
        expect(res.headers.getSetCookie()).toHaveLength(0)
      }
    })

    it("refuses an assertion for a different challenge than the one in the login step", async () => {
      const a = (await (await login()).json()).data
      const b = (await (await login()).json()).data
      const res = await post("/auth/login/webauthn", {
        challenge: a.challenge,
        response: key.assert(b.webauthn),
      })
      expect(res.status).toBe(401)
    })

    it("refuses a key that is not registered for this user", async () => {
      const data = (await (await login()).json()).data
      const stranger = newKey()
      const res = await post("/auth/login/webauthn", {
        challenge: data.challenge,
        response: stranger.assert(data.webauthn),
      })
      expect(res.status).toBe(401)
    })

    it("refuses a counter that does not move forward", async () => {
      const first = (await (await login()).json()).data
      expect(
        (
          await post("/auth/login/webauthn", {
            challenge: first.challenge,
            response: key.assert(first.webauthn, { counter: 500 }),
          })
        ).status,
      ).toBe(200)
      const second = (await (await login()).json()).data
      const cloned = await post("/auth/login/webauthn", {
        challenge: second.challenge,
        response: key.assert(second.webauthn, { counter: 10 }),
      })
      expect(cloned.status).toBe(401)
    })

    it("refuses a login step that carries no security-key challenge", async () => {
      // A user without keys gets a login step with no challenge at all.
      exec("DELETE FROM webauthn_credentials")
      const data = (await (await login()).json()).data
      expect(data.webauthn).toBeUndefined()
      const res = await post("/auth/login/webauthn", {
        challenge: data.challenge,
        response: key.assert({ challenge: "x" }),
      })
      expect(res.status).toBe(401)
    })

    it("still accepts the authenticator code", async () => {
      advance(60) // a TOTP step is single-use, and the enrolment already spent this one
      const data = (await (await login()).json()).data
      const ok = await post("/auth/login/2fa", { challenge: data.challenge, code: code() })
      expect(ok.status).toBe(200)
    })

    it("rate limits repeated failures, shared with the password step", async () => {
      exec("DELETE FROM webauthn_credentials")
      const k = newKey()
      expect((await addKey(k)).status).toBe(201)
      for (let i = 0; i < 5; i++) {
        const data = (await (await login()).json()).data
        const res = await post("/auth/login/webauthn", {
          challenge: data.challenge,
          response: k.assert(data.webauthn, { sign: false }),
        })
        expect(res.status).toBe(401)
      }
      // Five failures from this address: even the password step is refused now.
      expect((await login()).status).toBe(429)
    })
  })

  describe("management", () => {
    it("removing a key needs the password", async () => {
      exec("DELETE FROM webauthn_credentials")
      const k = newKey()
      expect((await addKey(k)).status).toBe(201)
      const url = `/auth/2fa/webauthn/${k.id}/delete`
      expect((await post(url, { password: "wrong" }, headers)).status).toBe(401)
      expect((await post(url, { password: PASSWORD }, headers)).status).toBe(200)
      expect((await post(url, { password: PASSWORD }, headers)).status).toBe(404)
      expect(sql("SELECT id FROM webauthn_credentials")).toHaveLength(0)
    })

    it("turning the authenticator app off removes the keys too", async () => {
      expect((await addKey(newKey())).status).toBe(201)
      advance(60)
      const off = await post("/auth/2fa/disable", { password: PASSWORD, code: code() }, headers)
      expect(off.status).toBe(200)
      expect(sql("SELECT id FROM webauthn_credentials")).toHaveLength(0)
    })

    it("is off when no public address is configured", async () => {
      const { webauthnConfig } = await import("../../services/webauthn")
      expect(webauthnConfig()).toEqual({ origin: ORIGIN, rpID: RP_ID })
    })
  })
})
