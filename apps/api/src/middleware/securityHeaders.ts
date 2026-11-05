import type { MiddlewareHandler } from "hono"
import { env } from "../env"

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next()

  c.res.headers.set("X-Content-Type-Options", "nosniff")
  c.res.headers.set("X-Frame-Options", "DENY")
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  c.res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  c.res.headers.set("X-XSS-Protection", "0")

  c.res.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
  )

  if (env.NODE_ENV === "production") {
    c.res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
  }
}
