import type { Context, MiddlewareHandler } from "hono"
import { env } from "../env"

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

/** Hosts we accept as "ourselves", from the request plus TRUSTED_ORIGINS. */
function trustedHosts(c: Context): Set<string> {
  const hosts = new Set<string>()
  for (const value of [c.req.header("host"), c.req.header("x-forwarded-host")]) {
    if (value) hosts.add(value.split(",")[0]?.trim().toLowerCase() ?? "")
  }
  for (const origin of env.TRUSTED_ORIGINS?.split(",") ?? []) {
    try {
      hosts.add(new URL(origin.trim()).host.toLowerCase())
    } catch {
      // ignore malformed entries
    }
  }
  return hosts
}

/**
 * CSRF protection for cookie-authenticated, state-changing requests.
 *
 * Relies on browser-enforced request provenance instead of a secret token:
 *  - Sec-Fetch-Site (sent by every current browser) must be same-origin/none;
 *  - otherwise the Origin header must match this host (or a trusted origin).
 * Cookies are also SameSite=Strict, so this is a second, independent layer.
 *
 * Requests that carry an Authorization header are not cookie-driven and are
 * exempt. A request with neither header comes from a non-browser client,
 * which is not a CSRF vector.
 */
export const csrf: MiddlewareHandler = async (c, next) => {
  if (SAFE_METHODS.has(c.req.method) || c.req.header("authorization")) {
    return next()
  }

  const site = c.req.header("sec-fetch-site")
  if (site) {
    if (site === "same-origin" || site === "none") return next()
    return c.json({ error: "Cross-site request blocked", code: "CSRF_INVALID" }, 403)
  }

  const origin = c.req.header("origin")
  if (origin) {
    try {
      if (trustedHosts(c).has(new URL(origin).host.toLowerCase())) return next()
    } catch {
      // fall through to rejection
    }
    return c.json({ error: "Cross-site request blocked", code: "CSRF_INVALID" }, 403)
  }

  return next()
}
