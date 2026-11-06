import type { Context, MiddlewareHandler, Next } from "hono"
import { currentSettings } from "../routes/settings"

interface Entry {
  count: number
  resetAt: number
}

interface RateLimitOptions {
  /** Max requests per window. A function so settings can change at runtime. */
  limit: number | (() => number)
  windowMs?: number
  /** Identity to count against (default: the :token path param). */
  key?: (c: Context) => string
}

/**
 * Fixed-window, in-memory rate limiter. Cronko runs as a single process on
 * SQLite, so a shared store (Redis) would add a moving part with no benefit.
 */
export function createRateLimiter(options: RateLimitOptions): MiddlewareHandler {
  const windowMs = options.windowMs ?? 60_000
  const store = new Map<string, Entry>()

  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
      if (now >= entry.resetAt) store.delete(key)
    }
  }, windowMs).unref()

  return async (c: Context, next: Next) => {
    const limit = typeof options.limit === "function" ? options.limit() : options.limit
    const key = options.key ? options.key(c) : (c.req.param("token") ?? "")
    const now = Date.now()

    let entry = store.get(key)
    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs }
      store.set(key, entry)
    }

    const allowed = entry.count < limit
    if (allowed) entry.count++

    c.header("X-RateLimit-Limit", String(limit))
    c.header("X-RateLimit-Remaining", String(Math.max(0, limit - entry.count)))
    c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)))

    if (!allowed) {
      c.header("Retry-After", String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))))
      return c.json({ error: "Rate limit exceeded", code: "RATE_LIMITED" }, 429)
    }

    await next()
  }
}

/** Ping endpoint limiter, per monitor token, limit from runtime settings. */
export const rateLimit = createRateLimiter({
  limit: () => currentSettings.pingRateLimitPerMinute,
})
