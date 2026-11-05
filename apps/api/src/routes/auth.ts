import { findUserByEmail } from "@cronko/database/queries/users"
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { deleteCookie, getCookie, setCookie } from "hono/cookie"
import { z } from "zod"
import { env } from "../env"
import { clientIp } from "../lib/clientIp"
import { authenticate } from "../middleware/authenticate"
import { logAuditEvent } from "../services/audit"
import {
  generateAccessToken,
  generateRefreshToken,
  verifyPassword,
  verifyRefreshToken,
} from "../services/auth"

export const authRoute = new Hono()

const loginStore = new Map<string, { count: number; resetAt: number }>()
const MAX_LOGIN_ATTEMPTS = 5
const LOGIN_WINDOW_MS = 15 * 60 * 1000

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of loginStore) {
    if (now >= entry.resetAt) loginStore.delete(key)
  }
}, 60_000).unref()

function checkLoginRateLimit(ip: string, email: string): boolean {
  const key = `${ip}:${email}`
  const now = Date.now()
  const entry = loginStore.get(key)

  if (entry && now < entry.resetAt) {
    if (entry.count >= MAX_LOGIN_ATTEMPTS) return false
    entry.count++
  } else {
    loginStore.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS })
  }
  return true
}

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

const isProd = () => env.NODE_ENV === "production"

authRoute.post("/login", zValidator("json", loginSchema), async (c) => {
  const { email, password } = c.req.valid("json")

  const ip = clientIp(c)

  if (!checkLoginRateLimit(ip, email)) {
    return c.json({ error: "Too many login attempts. Try again later.", code: "RATE_LIMITED" }, 429)
  }

  const user = await findUserByEmail(email)

  if (!user) {
    logAuditEvent({
      action: "login_failure",
      metadata: { email, reason: "user_not_found" },
      ipAddress: ip,
    }).catch(() => {})
    return c.json({ error: "Invalid credentials" }, 401)
  }

  const valid = await verifyPassword(password, user.password)

  if (!valid) {
    logAuditEvent({
      userId: user.id,
      action: "login_failure",
      metadata: { email, reason: "invalid_password" },
      ipAddress: ip,
    }).catch(() => {})
    return c.json({ error: "Invalid credentials" }, 401)
  }

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
})

authRoute.post("/refresh", async (c) => {
  const refreshToken = getCookie(c, "cronko_refresh")

  if (!refreshToken) {
    return c.json({ error: "No refresh token", code: "UNAUTHORIZED" }, 401)
  }

  try {
    const payload = await verifyRefreshToken(refreshToken)
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

authRoute.post("/logout", authenticate, async (c) => {
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
