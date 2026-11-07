import {
  disableTotp,
  enableTotp,
  findUserById,
  listRecoveryCodes,
  setPendingTotpSecret,
} from "@cronko/database/queries/users"
import { zValidator } from "@hono/zod-validator"
import type { Context } from "hono"
import { Hono } from "hono"
import { z } from "zod"
import { clientIp } from "../lib/clientIp"
import { clearLoginFailures, isLoginBlocked, loginKey, recordLoginFailure } from "../lib/loginLimit"
import { authenticate } from "../middleware/authenticate"
import { logAuditEvent } from "../services/audit"
import { verifyPassword } from "../services/auth"
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  otpauthUri,
  verifySecondFactor,
  verifyTotp,
} from "../services/totp"

/**
 * Two-factor management, mounted at /auth/2fa. Interactive sessions only: an API
 * token must never be able to enroll, change or remove a second factor.
 */
export const twoFactorRoute = new Hono()

twoFactorRoute.use("*", authenticate)
twoFactorRoute.use("*", async (c, next) => {
  if ((c as Context).get("apiToken")) {
    return c.json(
      { error: "API tokens cannot manage two-factor authentication", code: "FORBIDDEN" },
      403,
    )
  }
  await next()
})

const codeSchema = z.object({ code: z.string().min(1).max(32) })
const disableSchema = codeSchema.extend({ password: z.string().min(1) })

async function currentUser(c: { get: (k: string) => unknown }) {
  const payload = c.get("jwtPayload") as { sub: string }
  return findUserById(payload.sub)
}

twoFactorRoute.get("/", async (c) => {
  const user = await currentUser(c)
  if (!user) return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401)
  const enabled = !!user.totpEnabledAt
  return c.json({
    data: {
      enabled,
      recoveryCodesRemaining: enabled ? (await listRecoveryCodes(user.id)).length : 0,
    },
  })
})

/** Start enrollment: a fresh secret, stored sealed but inactive until a code proves the app has it. */
twoFactorRoute.post("/setup", async (c) => {
  const user = await currentUser(c)
  if (!user) return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401)
  const secret = generateTotpSecret()
  if (!(await setPendingTotpSecret(user.id, encryptTotpSecret(secret)))) {
    return c.json({ error: "Two-factor authentication is already enabled", code: "CONFLICT" }, 409)
  }
  return c.json({ data: { secret, otpauthUri: otpauthUri(secret, user.email) } })
})

/** Finish enrollment with a code from the app; returns the recovery codes once. */
twoFactorRoute.post("/enable", zValidator("json", codeSchema), async (c) => {
  const user = await currentUser(c)
  if (!user) return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401)
  if (user.totpEnabledAt) {
    return c.json({ error: "Two-factor authentication is already enabled", code: "CONFLICT" }, 409)
  }
  const secret = user.totpSecret ? decryptTotpSecret(user.totpSecret) : null
  if (!secret) {
    return c.json({ error: "Start setup first", code: "SETUP_REQUIRED" }, 400)
  }

  const ip = clientIp(c)
  const limitKey = loginKey(ip, user.email)
  if (isLoginBlocked(limitKey)) {
    return c.json({ error: "Too many attempts. Try again later.", code: "RATE_LIMITED" }, 429)
  }

  const step = verifyTotp(secret, c.req.valid("json").code)
  if (step === null) {
    recordLoginFailure(limitKey)
    return c.json({ error: "Invalid code", code: "INVALID_CODE" }, 400)
  }

  clearLoginFailures(limitKey)
  const recoveryCodes = generateRecoveryCodes()
  await enableTotp(user.id, step, recoveryCodes.map(hashRecoveryCode))
  logAuditEvent({ userId: user.id, action: "2fa_enabled", ipAddress: ip }).catch(() => {})
  return c.json({ data: { recoveryCodes } })
})

/** Turning it off needs both factors: the password and a current code (or recovery code). */
twoFactorRoute.post("/disable", zValidator("json", disableSchema), async (c) => {
  const user = await currentUser(c)
  if (!user) return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401)
  if (!user.totpEnabledAt) {
    return c.json({ error: "Two-factor authentication is not enabled", code: "CONFLICT" }, 409)
  }

  const ip = clientIp(c)
  const limitKey = loginKey(ip, user.email)
  if (isLoginBlocked(limitKey)) {
    return c.json({ error: "Too many attempts. Try again later.", code: "RATE_LIMITED" }, 429)
  }

  const { password, code } = c.req.valid("json")
  // Evaluate both so a wrong password and a wrong code look the same from outside.
  const passwordOk = await verifyPassword(password, user.password)
  const factor = await verifySecondFactor(user, code)
  if (!passwordOk || !factor) {
    recordLoginFailure(limitKey)
    return c.json({ error: "Invalid password or code", code: "INVALID_CREDENTIALS" }, 401)
  }

  clearLoginFailures(limitKey)
  await disableTotp(user.id)
  logAuditEvent({ userId: user.id, action: "2fa_disabled", ipAddress: ip }).catch(() => {})
  return c.json({ data: { ok: true } })
})
