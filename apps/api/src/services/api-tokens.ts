import { createHash, randomBytes } from "node:crypto"

export const API_TOKEN_PREFIX = "crk_"
export const API_TOKEN_SCOPES = ["read", "write"] as const
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number]

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** A new random token (shown once), its stored hash and the visible prefix. */
export function generateApiToken() {
  const token = API_TOKEN_PREFIX + randomBytes(32).toString("base64url")
  return { token, hash: hashApiToken(token), prefix: token.slice(0, API_TOKEN_PREFIX.length + 6) }
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

/**
 * What a token may do. Token management itself needs a real session, so a token
 * can never mint or list tokens, or read the ping key. `read` is GET only; `write` may also change
 * monitors (create, edit, pause, delete...), nothing else.
 */
export function scopeAllows(scope: ApiTokenScope, method: string, path: string): boolean {
  if (/^\/api\/settings\/(tokens|ping-key)(\/|$)/.test(path)) return false
  if (SAFE_METHODS.has(method)) return true
  return scope === "write" && /^\/api\/monitors(\/|$)/.test(path)
}
