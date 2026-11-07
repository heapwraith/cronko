import {
  disableTotp,
  enableTotp,
  findUserById,
  listRecoveryCodes,
  setPendingTotpSecret,
} from "@cronko/database/queries/users"
import {
  deleteAllWebauthnCredentials,
  deleteWebauthnCredential,
  listWebauthnCredentials,
} from "@cronko/database/queries/webauthn"
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
import { beginRegistration, finishRegistration, webauthnConfig } from "../services/webauthn"

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
  // Security keys ride on TOTP (the recovery codes are their way back in), so they go too.
  await deleteAllWebauthnCredentials(user.id)
  logAuditEvent({ userId: user.id, action: "2fa_disabled", ipAddress: ip }).catch(() => {})
  return c.json({ data: { ok: true } })
})

// --- security keys (WebAuthn) -------------------------------------------------------------

const credentialView = (c: Awaited<ReturnType<typeof listWebauthnCredentials>>[number]) => ({
  id: c.id,
  name: c.name,
  createdAt: c.createdAt,
  lastUsedAt: c.lastUsedAt,
})

twoFactorRoute.get("/webauthn", async (c) => {
  const user = await currentUser(c)
  if (!user) return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401)
  return c.json({
    data: {
      available: webauthnConfig() !== null,
      credentials: (await listWebauthnCredentials(user.id)).map(credentialView),
    },
  })
})

/** Step 1 of adding a key. Needs TOTP on first, so the recovery codes always exist. */
twoFactorRoute.post("/webauthn/register/options", async (c) => {
  const user = await currentUser(c)
  if (!user) return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401)
  if (!webauthnConfig()) {
    return c.json(
      {
        error: "Security keys need PUBLIC_URL (or WEBAUTHN_ORIGIN) to be set",
        code: "NOT_CONFIGURED",
      },
      400,
    )
  }
  if (!user.totpEnabledAt) {
    return c.json({ error: "Turn on the authenticator app first", code: "SETUP_REQUIRED" }, 409)
  }
  return c.json({ data: await beginRegistration(user) })
})

const registerSchema = z.object({
  name: z.string().trim().min(1).max(60),
  // The browser's answer; the library validates its structure.
  response: z.looseObject({ id: z.string().min(1), type: z.literal("public-key") }),
})

/** Step 2: the browser's attestation. One try per challenge. */
twoFactorRoute.post("/webauthn/register/verify", zValidator("json", registerSchema), async (c) => {
  const user = await currentUser(c)
  if (!user) return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401)
  if (!user.totpEnabledAt) {
    return c.json({ error: "Turn on the authenticator app first", code: "SETUP_REQUIRED" }, 409)
  }
  const { name, response } = c.req.valid("json")
  const saved = await finishRegistration(
    user,
    response as unknown as Parameters<typeof finishRegistration>[1],
    name,
  )
  if (!saved) {
    return c.json({ error: "Could not verify the security key", code: "INVALID_CREDENTIAL" }, 400)
  }
  logAuditEvent({
    userId: user.id,
    action: "2fa_security_key_added",
    metadata: { name },
    ipAddress: clientIp(c),
  }).catch(() => {})
  return c.json({ data: { id: saved.id } }, 201)
})

/** Removing a key asks for the password, like turning 2FA off. */
twoFactorRoute.post(
  "/webauthn/:id/delete",
  zValidator("json", z.object({ password: z.string().min(1) })),
  async (c) => {
    const user = await currentUser(c)
    if (!user) return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401)

    const ip = clientIp(c)
    const limitKey = loginKey(ip, user.email)
    if (isLoginBlocked(limitKey)) {
      return c.json({ error: "Too many attempts. Try again later.", code: "RATE_LIMITED" }, 429)
    }
    if (!(await verifyPassword(c.req.valid("json").password, user.password))) {
      recordLoginFailure(limitKey)
      return c.json({ error: "Invalid password", code: "INVALID_CREDENTIALS" }, 401)
    }
    clearLoginFailures(limitKey)
    if (!(await deleteWebauthnCredential(user.id, c.req.param("id")))) {
      return c.json({ error: "Not found", code: "NOT_FOUND" }, 404)
    }
    logAuditEvent({ userId: user.id, action: "2fa_security_key_removed", ipAddress: ip }).catch(
      () => {},
    )
    return c.json({ data: { ok: true } })
  },
)
