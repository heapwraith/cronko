import type { Context, Next } from "hono"
import { getCookie } from "hono/cookie"
import { API_TOKEN_PREFIX, hashApiToken, scopeAllows } from "../services/api-tokens"
import { verifyAccessToken } from "../services/auth"

const TOUCH_INTERVAL_MS = 60_000

/** Resolve a `crk_` API token; returns a Response when the request must be refused. */
async function authenticateApiToken(c: Context, token: string): Promise<Response | null> {
  const { findApiTokenByHash, touchApiToken } = await import("@cronko/database/queries/api-tokens")
  const row = await findApiTokenByHash(hashApiToken(token))
  const now = Date.now()
  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt.getTime() <= now)) {
    return c.json({ error: "Token expired or invalid", code: "UNAUTHORIZED" }, 401)
  }

  if (!scopeAllows(row.scope, c.req.method, c.req.path)) {
    return c.json(
      { error: `Token scope "${row.scope}" does not allow this request`, code: "FORBIDDEN" },
      403,
    )
  }

  // Throttled: a busy script should not turn every read into a write.
  if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    await touchApiToken(row.id, new Date(now)).catch(() => {})
  }
  c.set("jwtPayload", { sub: row.userId, email: "" })
  c.set("apiToken", { id: row.id, scope: row.scope })
  return null
}

export async function authenticate(c: Context, next: Next) {
  let token: string | undefined

  const header = c.req.header("Authorization")
  if (header?.startsWith("Bearer ")) {
    token = header.slice(7)
  } else {
    token = getCookie(c, "cronko_token")
  }

  if (!token) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401)
  }

  if (token.startsWith(API_TOKEN_PREFIX)) {
    const refused = await authenticateApiToken(c, token)
    if (refused) return refused
    return next()
  }

  try {
    const payload = await verifyAccessToken(token)
    c.set("jwtPayload", payload)
  } catch {
    return c.json({ error: "Token expired or invalid", code: "UNAUTHORIZED" }, 401)
  }

  await next()
}
