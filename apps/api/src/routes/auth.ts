import { isTokenRevoked, revokeToken } from "@cronko/database/queries/revoked-tokens"
import { findUserByEmail, findUserById } from "@cronko/database/queries/users"
import { zValidator } from "@hono/zod-validator"
import type { Context } from "hono"
import { Hono } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { z } from "zod"
import { env } from "../env"
import { clientIp } from "../lib/clientIp"
import { clearLoginFailures, isLoginBlocked, loginKey, recordLoginFailure } from "../lib/loginLimit"
import { authenticate } from "../middleware/authenticate"
import { logAuditEvent } from "../services/audit"
import {
  generateAccessToken,
  generateRefreshToken,
  generateTwoFactorChallenge,
  verifyAccessToken,
  verifyPassword,
  verifyRefreshToken,
  verifyTwoFactorChallenge,
} from "../services/auth"
import { verifySecondFactor } from "../services/totp"
import { twoFactorRoute } from "./two-factor"

export const authRoute = new Hono()
authRoute.route("/2fa", twoFactorRoute)

const twoFactorLoginSchema = z.object({
  challenge: z.string().min(1),
  code: z.string().min(1).max(32),
})

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

const isProd = () => env.NODE_ENV === "production"

authRoute.post("/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json")

  const ip = clientIp(c)

  const limitKey = loginKey(ip, email)
  if (isLoginBlocked(limitKey)) {
    return c.json({ error: "Too many login attempts. Try again later.", code: "RATE_LIMITED" }, 429)
  }

  const user = await findUserByEmail(email)

  if (!user) {
    recordLoginFailure(limitKey)
    logAuditEvent({
      action: "login_failure",
      metadata: { email, reason: "user_not_found" },
      ipAddress: ip,
    }).catch(() => {})
    return c.json({ error: "Invalid credentials" }, 401)
  }

  const valid = await verifyPassword(password, user.password)

  if (!valid) {
    recordLoginFailure(limitKey)
    logAuditEvent({
      userId: user.id,
      action: "login_failure",
      metadata: { email, reason: "invalid_password" },
      ipAddress: ip,
    }).catch(() => {})
    return c.json({ error: "Invalid credentials" }, 401)
  }

  if (user.totpEnabledAt) {
    // Password alone is not a login. The failure counter is deliberately NOT reset
    // here, otherwise guessing codes would never run out of attempts.
    return c.json({
      data: {
        twoFactorRequired: true,
        challenge: await generateTwoFactorChallenge(user.id, user.email),
      },
    })
  }

  return completeLogin(c, user, ip, limitKey)
})

/** Second step for accounts with 2FA: the challenge from /login plus a TOTP or recovery code. */
authRoute.post("/login/2fa", zValidator("json", twoFactorLoginSchema), async (c) => {
  const { challenge, code } = c.req.valid("json")
  const ip = clientIp(c)

  let payload: Awaited<ReturnType<typeof verifyTwoFactorChallenge>>
  try {
    payload = await verifyTwoFactorChallenge(challenge)
  } catch {
    return c.json({ error: "Challenge expired or invalid", code: "UNAUTHORIZED" }, 401)
  }

  const limitKey = loginKey(ip, payload.email)
  if (isLoginBlocked(limitKey)) {
    return c.json({ error: "Too many login attempts. Try again later.", code: "RATE_LIMITED" }, 429)
  }

  const user = await findUserById(payload.sub)
  const method = user?.totpEnabledAt ? await verifySecondFactor(user, code) : null
  if (!user || !method) {
    recordLoginFailure(limitKey)
    logAuditEvent({
      ...(user && { userId: user.id }),
      action: "login_failure",
      metadata: { email: payload.email, reason: "invalid_second_factor" },
      ipAddress: ip,
    }).catch(() => {})
    return c.json({ error: "Invalid code", code: "INVALID_CODE" }, 401)
  }

  if (method === "recovery") {
    logAuditEvent({ userId: user.id, action: "2fa_recovery_code_used", ipAddress: ip }).catch(
      () => {},
    )
  }
  return completeLogin(c, user, ip, limitKey)
})

/** Issue the session cookies for a user who has passed every required factor. */
async function completeLogin(
  c: Context,
  user: { id: string; email: string },
  ip: string,
  limitKey: string,
) {
  clearLoginFailures(limitKey)
  const accessToken = await generateAccessToken(user.id, user.email)
  const refreshToken = await generateRefreshToken(user.id, user.email)

  setCookie(c, "cronko_token", accessToken, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "Strict",
    path: "/",
    maxAge: 15 * 60,
  })

  setCookie(c, "cronko_refresh", refreshToken, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "Strict",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  })

  logAuditEvent({
    userId: user.id,
    action: "login_success",
    ipAddress: ip,
  }).catch(() => {})

  const now = Math.floor(Date.now() / 1000)
  const expiresAt = new Date((now + 15 * 60) * 1000).toISOString()

  return c.json({
    data: {
      token: accessToken,
      email: user.email,
      expiresAt,
    },
  })
}

authRoute.post("/refresh", async (c) => {
  const refreshToken = getCookie(c, "cronko_refresh")

  if (!refreshToken) {
    return c.json({ error: "No refresh token", code: "UNAUTHORIZED" }, 401)
  }

  try {
    const payload = await verifyRefreshToken(refreshToken)
    if (payload.jti && (await isTokenRevoked(payload.jti))) throw new Error("revoked")
    const accessToken = await generateAccessToken(payload.sub, payload.email)

    setCookie(c, "cronko_token", accessToken, {
      httpOnly: true,
      secure: isProd(),
      sameSite: "Strict",
      path: "/",
      maxAge: 15 * 60,
    })

    const now = Math.floor(Date.now() / 1000)
    const expiresAt = new Date((now + 15 * 60) * 1000).toISOString()

    return c.json({
      data: {
        token: accessToken,
        email: payload.email,
        expiresAt,
      },
    })
  } catch {
    deleteCookie(c, "cronko_refresh", {
      httpOnly: true,
      secure: isProd(),
      sameSite: "Strict",
      path: "/",
    })
    return c.json({ error: "Refresh token expired or invalid", code: "UNAUTHORIZED" }, 401)
  }
})

/**
 * Revoke the session server-side, not just the cookies: a stolen refresh token
 * must stop working too. No `authenticate` here on purpose: logging out with an
 * expired access token must still kill the refresh token. Idempotent, and
 * best-effort per token (an invalid or already-expired one has nothing to revoke).
 */
authRoute.post("/logout", async (c) => {
  const bearer = c.req.header("Authorization")
  const access = bearer?.startsWith("Bearer ") ? bearer.slice(7) : getCookie(c, "cronko_token")
  const refresh = getCookie(c, "cronko_refresh")

  if (access && !access.startsWith("crk_")) {
    const payload = await verifyAccessToken(access).catch(() => null)
    if (payload?.jti) await revokeToken(payload.jti, new Date(payload.exp * 1000))
  }
  if (refresh) {
    const payload = await verifyRefreshToken(refresh).catch(() => null)
    if (payload?.jti) await revokeToken(payload.jti, new Date(payload.exp * 1000))
  }

  deleteCookie(c, "cronko_token", {
    httpOnly: true,
    secure: isProd(),
    sameSite: "Strict",
    path: "/",
  })

  deleteCookie(c, "cronko_refresh", {
    httpOnly: true,
    secure: isProd(),
    sameSite: "Strict",
    path: "/",
  })

  return c.json({ data: { ok: true } })
})

authRoute.get("/me", authenticate, async (c) => {
  const payload = c.get("jwtPayload") as { sub: string; email: string }

  return c.json({
    data: {
      id: payload.sub,
      email: payload.email,
    },
  })
})
