import { getConnInfo } from "@hono/node-server/conninfo"
import type { Context } from "hono"
import { env } from "../env"

/**
 * Best-effort client IP. X-Forwarded-For is attacker-controlled unless a
 * trusted reverse proxy sets it, so it is only honoured with TRUST_PROXY=true.
 */
export function clientIp(c: Context): string {
  if (env.TRUST_PROXY === "true") {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim()
    if (forwarded) return forwarded
    const real = c.req.header("x-real-ip")
    if (real) return real
  }
  try {
    return getConnInfo(c).remote.address ?? "unknown"
  } catch {
    return "unknown"
  }
}
