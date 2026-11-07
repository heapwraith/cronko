import { timingSafeEqual } from "node:crypto"
import { findUserByEmail } from "@cronko/database/queries/users"
import { Hono } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { env } from "../env"
import { clientIp, peerAddress } from "../lib/clientIp"
import { logger } from "../lib/logger"
import { clearLoginFailures, isLoginBlocked, recordLoginFailure } from "../lib/loginLimit"
import { createWindowCounter } from "../middleware/rateLimit"
import { logAuditEvent } from "../services/audit"
import { setSessionCookies } from "../services/session"
import {
  finishOidc,
  isTrustedPeer,
  oidcEnabled,
  passwordLoginEnabled,
  proxyEnabled,
  SsoError,
  startOidc,
} from "../services/sso"

/** Single sign-on endpoints (mounted at /auth/sso). Browser navigations, so they redirect. */
export const ssoRoute = new Hono()

const STATE_COOKIE = "cronko_sso"
const COOKIE_PATH = "/auth/sso"
/** Sign-in starts per client address, so the endpoint cannot be used to hammer the IdP. */
const starts = createWindowCounter(30)
/** Failed SSO sign-ins share the password login's limiter: 5 in 15 minutes per address. */
const ssoKey = (ip: string) => `sso:${ip}`

const fail = (code: string) => `/login?sso_error=${encodeURIComponent(code)}`
const secure = () => env.NODE_ENV === "production"

/** What the login page needs to know; nothing secret. */
ssoRoute.get("/config", (c) =>
  c.json({
    data: { oidc: oidcEnabled(), proxy: proxyEnabled(), passwordLogin: passwordLoginEnabled() },
  }),
)

ssoRoute.get("/oidc/start", async (c) => {
  if (!oidcEnabled()) return c.json({ error: "Not found" }, 404)
  if (!starts(clientIp(c)).allowed) return c.redirect(fail("rate_limited"))
  try {
    const start = await startOidc()
    // Lax, not Strict: the browser comes back from another site and must still send it.
    setCookie(
      c,
      STATE_COOKIE,
      JSON.stringify({ s: start.state, n: start.nonce, v: start.verifier }),
      {
        httpOnly: true,
        secure: secure(),
        sameSite: "Lax",
        path: COOKIE_PATH,
        maxAge: 600,
      },
    )
    return c.redirect(start.url)
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : err }, "oidc start failed")
    return c.redirect(fail("provider_unavailable"))
  }
})

ssoRoute.get("/oidc/callback", async (c) => {
  if (!oidcEnabled()) return c.json({ error: "Not found" }, 404)
  const ip = clientIp(c)
  const raw = getCookie(c, STATE_COOKIE)
  // One try per flow: the cookie is spent whatever happens next.
  deleteCookie(c, STATE_COOKIE, { path: COOKIE_PATH })

  const reject = (code: string, reason: string, email?: string) => {
    recordLoginFailure(ssoKey(ip))
    logAuditEvent({
      action: "login_failure",
      metadata: { method: "oidc", reason, ...(email && { email }) },
      ipAddress: ip,
    }).catch(() => {})
    return c.redirect(fail(code))
  }

  if (isLoginBlocked(ssoKey(ip))) return c.redirect(fail("rate_limited"))
  if (c.req.query("error")) return reject("denied", `provider_error:${c.req.query("error")}`)

  let saved: { s: string; n: string; v: string }
  try {
    saved = JSON.parse(raw ?? "")
  } catch {
    return reject("invalid_state", "missing_state_cookie")
  }
  const state = c.req.query("state") ?? ""
  const code = c.req.query("code") ?? ""
  const a = Buffer.from(state)
  const b = Buffer.from(saved.s ?? "")
  if (!code || a.length === 0 || a.length !== b.length || !timingSafeEqual(a, b)) {
    return reject("invalid_state", "state_mismatch")
  }

  let email: string
  try {
    email = await finishOidc({ code, nonce: saved.n, verifier: saved.v })
  } catch (err) {
    const reason = err instanceof SsoError ? err.code : "error"
    if (!(err instanceof SsoError)) logger.error({ err }, "oidc callback failed")
    return reject("failed", reason)
  }

  const user = await findUserByEmail(email)
  if (!user) return reject("not_allowed", "user_not_found", email)

  clearLoginFailures(ssoKey(ip))
  await setSessionCookies(c, user)
  logAuditEvent({
    userId: user.id,
    action: "login_success",
    metadata: { method: "oidc" },
    ipAddress: ip,
  }).catch(() => {})
  return c.redirect("/")
})

/**
 * Trusted-proxy login: the reverse proxy authenticates the user and forwards the e-mail in a
 * header. It is honoured only when the TCP peer is one of TRUSTED_PROXY_IPS, never because of
 * a forwarded header, and an untrusted peer's header is ignored.
 */
ssoRoute.get("/proxy", async (c) => {
  if (!proxyEnabled()) return c.json({ error: "Not found" }, 404)
  const ip = clientIp(c)
  const reject = (code: string, reason: string, email?: string) => {
    recordLoginFailure(ssoKey(ip))
    logAuditEvent({
      action: "login_failure",
      metadata: { method: "proxy", reason, ...(email && { email }) },
      ipAddress: ip,
    }).catch(() => {})
    return c.redirect(fail(code))
  }

  if (isLoginBlocked(ssoKey(ip))) return c.redirect(fail("rate_limited"))
  if (!isTrustedPeer(peerAddress(c))) return reject("untrusted_proxy", "untrusted_peer")
  const email = c.req.header(env.TRUSTED_PROXY_AUTH_HEADER ?? "")?.trim()
  if (!email) return reject("no_identity", "header_missing")

  const user = await findUserByEmail(email)
  if (!user) return reject("not_allowed", "user_not_found", email)

  clearLoginFailures(ssoKey(ip))
  await setSessionCookies(c, user)
  logAuditEvent({
    userId: user.id,
    action: "login_success",
    metadata: { method: "proxy" },
    ipAddress: ip,
  }).catch(() => {})
  return c.redirect("/")
})
