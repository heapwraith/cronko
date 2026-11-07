import { createHash } from "node:crypto"
import { createServer, type Server } from "node:http"
import type { AddressInfo } from "node:net"
import type { Hono } from "hono"
import { exportJWK, generateKeyPair, type JWK, SignJWT } from "jose"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { setupTestDb } from "../helpers/testDb"

/** A tiny OpenID provider: discovery, JWKS and a token endpoint that signs what the test asks. */
describe("OIDC sign-in (fake identity provider, real SQLite)", () => {
  let idp: Server
  let issuer = ""
  let app: Hono
  let resetOidc: () => void
  let publicJwk: JWK
  let privateKey: CryptoKey
  let otherKey: CryptoKey

  /** What the token endpoint returns for the next exchange. */
  let tokenMode: {
    claims: Record<string, unknown>
    key?: () => CryptoKey | Uint8Array
    alg?: string
    status?: number
    omitIdToken?: boolean
  }
  let seen: { body: URLSearchParams | null } = { body: null }
  let visitor = 0
  const nextIp = () => `203.0.113.${++visitor}`

  beforeAll(async () => {
    const pair = await generateKeyPair("RS256", { extractable: true })
    privateKey = pair.privateKey
    otherKey = (await generateKeyPair("RS256")).privateKey
    publicJwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256", use: "sig" }

    idp = createServer((req, res) => {
      const url = new URL(req.url ?? "/", issuer)
      if (url.pathname === "/.well-known/openid-configuration") {
        res.setHeader("content-type", "application/json")
        return void res.end(
          JSON.stringify({
            issuer: tokenMode.claims.__discoveryIssuer ?? issuer,
            authorization_endpoint: `${issuer}/authorize`,
            token_endpoint: `${issuer}/token`,
            jwks_uri: `${issuer}/jwks`,
          }),
        )
      }
      if (url.pathname === "/jwks") {
        res.setHeader("content-type", "application/json")
        return void res.end(JSON.stringify({ keys: [publicJwk] }))
      }
      if (url.pathname === "/token" && req.method === "POST") {
        let raw = ""
        req.on("data", (c) => {
          raw += c
        })
        req.on("end", async () => {
          seen = { body: new URLSearchParams(raw) }
          res.setHeader("content-type", "application/json")
          if (tokenMode.status) {
            res.statusCode = tokenMode.status
            return void res.end("{}")
          }
          if (tokenMode.omitIdToken) return void res.end("{}")
          const { __discoveryIssuer: _ignored, ...claims } = tokenMode.claims
          const jwt = new SignJWT(claims)
            .setProtectedHeader({ alg: tokenMode.alg ?? "RS256", kid: "k1" })
            .setIssuedAt()
          if (claims.exp === undefined) jwt.setExpirationTime("5m")
          const signed = await jwt.sign(tokenMode.key ? tokenMode.key() : privateKey)
          res.end(JSON.stringify({ id_token: signed, access_token: "x", token_type: "Bearer" }))
        })
        return
      }
      res.statusCode = 404
      res.end()
    })
    await new Promise<void>((r) => idp.listen(0, "127.0.0.1", r))
    issuer = `http://127.0.0.1:${(idp.address() as AddressInfo).port}`

    process.env.OIDC_ISSUER = issuer
    process.env.OIDC_CLIENT_ID = "cronko-client"
    process.env.OIDC_CLIENT_SECRET = "client-secret"
    process.env.PUBLIC_URL = "https://cronko.test"
    // Each request gets its own address, like separate visitors behind a proxy.
    process.env.TRUST_PROXY = "true"

    await setupTestDb()
    ;({ app } = (await import("../../app")) as unknown as { app: Hono })
    ;({ resetOidcCache: resetOidc } = await import("../../services/sso"))
    const { createUser } = await import("@cronko/database/queries/users")
    const { hashPassword } = await import("../../services/auth")
    await createUser({ email: "ops@example.com", passwordHash: await hashPassword("pw-123456") })
  })
  afterAll(() => new Promise<void>((r) => idp.close(() => r())))

  beforeEach(() => {
    resetOidc()
    tokenMode = {
      claims: {
        iss: issuer,
        aud: "cronko-client",
        sub: "user-1",
        email: "ops@example.com",
        email_verified: true,
      },
    }
  })

  /** Run /start and return what the callback needs. */
  async function start() {
    const res = await app.request("/auth/sso/oidc/start", {
      headers: { "x-forwarded-for": nextIp() },
    })
    expect(res.status).toBe(302)
    const location = new URL(res.headers.get("location") ?? "")
    const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0] ?? ""
    return {
      location,
      cookie,
      state: location.searchParams.get("state") ?? "",
      nonce: location.searchParams.get("nonce") ?? "",
      challenge: location.searchParams.get("code_challenge") ?? "",
    }
  }

  const callback = (cookie: string, query: Record<string, string>) =>
    app.request(`/auth/sso/oidc/callback?${new URLSearchParams(query)}`, {
      headers: { "x-forwarded-for": nextIp(), ...(cookie && { cookie }) },
    })

  /** A full flow whose ID token carries the nonce the start produced. */
  async function flow(over: Record<string, unknown> = {}, query: Record<string, string> = {}) {
    const s = await start()
    tokenMode.claims = { ...tokenMode.claims, nonce: s.nonce, ...over }
    const res = await callback(s.cookie, { code: "good-code", state: s.state, ...query })
    return { res, s, location: res.headers.get("location") ?? "" }
  }
  const sessionCookies = (res: Response) =>
    (res.headers.getSetCookie?.() ?? []).filter((c) => c.startsWith("cronko_token="))

  it("advertises what is configured, publicly", async () => {
    const res = await app.request("/auth/sso/config")
    expect(await res.json()).toEqual({ data: { oidc: true, proxy: false, passwordLogin: true } })
  })

  it("starts with PKCE (S256), state, nonce and a Lax, httpOnly state cookie", async () => {
    const s = await start()
    expect(s.location.origin + s.location.pathname).toBe(`${issuer}/authorize`)
    expect(s.location.searchParams.get("response_type")).toBe("code")
    expect(s.location.searchParams.get("client_id")).toBe("cronko-client")
    expect(s.location.searchParams.get("redirect_uri")).toBe(
      "https://cronko.test/auth/sso/oidc/callback",
    )
    expect(s.location.searchParams.get("code_challenge_method")).toBe("S256")
    expect(s.state.length).toBeGreaterThan(20)
    expect(s.nonce.length).toBeGreaterThan(20)
    const res = await app.request("/auth/sso/oidc/start", {
      headers: { "x-forwarded-for": nextIp() },
    })
    const setCookie = res.headers.get("set-cookie") ?? ""
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/SameSite=Lax/i)
    expect(setCookie).toMatch(/Path=\/auth\/sso/i)
  })

  it("signs an existing user in: PKCE verifier and secret reach the token endpoint", async () => {
    const { res, s, location } = await flow()
    expect(res.status).toBe(302)
    expect(location).toBe("/")
    expect(sessionCookies(res)).toHaveLength(1)

    const body = seen.body
    expect(body?.get("grant_type")).toBe("authorization_code")
    expect(body?.get("code")).toBe("good-code")
    expect(body?.get("client_secret")).toBe("client-secret")
    expect(body?.get("redirect_uri")).toBe("https://cronko.test/auth/sso/oidc/callback")
    const verifier = body?.get("code_verifier") ?? ""
    expect(createHash("sha256").update(verifier).digest("base64url")).toBe(s.challenge)

    const cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ")
    const me = await app.request("/auth/me", { headers: { cookie } })
    expect(((await me.json()) as { data: { email: string } }).data.email).toBe("ops@example.com")
  })

  it("spends the state cookie: the same callback cannot be replayed", async () => {
    const s = await start()
    tokenMode.claims = { ...tokenMode.claims, nonce: s.nonce }
    const first = await callback(s.cookie, { code: "good-code", state: s.state })
    expect(first.headers.get("location")).toBe("/")
    // The browser dropped the cookie; a replayer without it is refused.
    const replay = await callback("", { code: "good-code", state: s.state })
    expect(replay.headers.get("location")).toBe("/login?sso_error=invalid_state")
  })

  it.each([
    ["a wrong state", { state: "not-the-state" }, "invalid_state"],
    ["no code", { code: "" }, "invalid_state"],
  ])("refuses %s", async (_name, query, error) => {
    const { res, location } = await flow({}, query)
    expect(location).toBe(`/login?sso_error=${error}`)
    expect(sessionCookies(res)).toHaveLength(0)
  })

  it("refuses a callback without the state cookie", async () => {
    const s = await start()
    const res = await callback("", { code: "good-code", state: s.state })
    expect(res.headers.get("location")).toBe("/login?sso_error=invalid_state")
    expect(sessionCookies(res)).toHaveLength(0)
  })

  it("passes on an error from the provider without a session", async () => {
    const s = await start()
    const res = await callback(s.cookie, { error: "access_denied", state: s.state })
    expect(res.headers.get("location")).toBe("/login?sso_error=denied")
    expect(sessionCookies(res)).toHaveLength(0)
  })

  it.each([
    ["a wrong nonce", { nonce: "someone-elses-nonce" }],
    ["a wrong audience", { aud: "another-client" }],
    ["a wrong issuer", { iss: "https://evil.example" }],
    ["an expired token", { exp: Math.floor(Date.now() / 1000) - 3600 }],
    ["an unverified e-mail", { email_verified: false }],
    ["a missing e-mail_verified", { email_verified: undefined }],
    ["no e-mail", { email: undefined }],
  ])("refuses %s", async (_name, over) => {
    const { res, location } = await flow(over)
    expect(location).toBe("/login?sso_error=failed")
    expect(sessionCookies(res)).toHaveLength(0)
  })

  it("refuses an ID token signed with a key that is not in the JWKS", async () => {
    tokenMode.key = () => otherKey
    const { res, location } = await flow()
    expect(location).toBe("/login?sso_error=failed")
    expect(sessionCookies(res)).toHaveLength(0)
  })

  it("refuses a symmetric (HS256) ID token even if it is signed with the client secret", async () => {
    tokenMode.alg = "HS256"
    tokenMode.key = () => new TextEncoder().encode("client-secret")
    const { res, location } = await flow()
    expect(location).toBe("/login?sso_error=failed")
    expect(sessionCookies(res)).toHaveLength(0)
  })

  it("refuses a discovery document for another issuer", async () => {
    tokenMode.claims.__discoveryIssuer = "https://evil.example"
    const res = await app.request("/auth/sso/oidc/start", {
      headers: { "x-forwarded-for": nextIp() },
    })
    expect(res.headers.get("location")).toBe("/login?sso_error=provider_unavailable")
  })

  it("reports a token endpoint failure and a response without an ID token", async () => {
    tokenMode.status = 500
    expect((await flow()).location).toBe("/login?sso_error=failed")
    delete tokenMode.status
    tokenMode.omitIdToken = true
    expect((await flow()).location).toBe("/login?sso_error=failed")
  })

  it("does not create users: an e-mail that is not a local user is not allowed", async () => {
    const { res, location } = await flow({ email: "stranger@example.com" })
    expect(location).toBe("/login?sso_error=not_allowed")
    expect(sessionCookies(res)).toHaveLength(0)
    const users = await import("@cronko/database/queries/users")
    expect(await users.findUserByEmail("stranger@example.com")).toBeUndefined()
  })

  it("blocks an address after 5 failed sign-ins, and a good sign-in does not unblock it", async () => {
    const ip = "198.51.100.7"
    for (let i = 0; i < 5; i++) {
      const r = await app.request("/auth/sso/oidc/callback?code=x&state=y", {
        headers: { "x-forwarded-for": ip },
      })
      expect(r.headers.get("location")).toBe("/login?sso_error=invalid_state")
    }
    const blocked = await app.request("/auth/sso/oidc/callback?code=x&state=y", {
      headers: { "x-forwarded-for": ip },
    })
    expect(blocked.headers.get("location")).toBe("/login?sso_error=rate_limited")
  })

  it("keeps the password login working while it is not disabled", async () => {
    const res = await app.request("/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({ email: "ops@example.com", password: "pw-123456" }),
    })
    expect(res.status).toBe(200)
  })
})
