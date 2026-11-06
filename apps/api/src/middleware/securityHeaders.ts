import type { MiddlewareHandler } from "hono"
import { env } from "../env"

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next()

  c.res.headers.set("X-Content-Type-Options", "nosniff")
  c.res.headers.set("X-Frame-Options", "DENY")
  c.res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  c.res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  c.res.headers.set("X-XSS-Protection", "0")

  // The API docs page (Scalar) needs inline scripts/styles and a CDN; keep the
  // strict policy for everything else, including the app itself.
  const isDocs = c.req.path === "/docs"
  c.res.headers.set(
    "Content-Security-Policy",
    isDocs
      ? "default-src 'self' https://cdn.jsdelivr.net; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; img-src 'self' data: https:; font-src 'self' data: https://cdn.jsdelivr.net; connect-src 'self'"
      : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  )

  if (env.NODE_ENV === "production") {
    c.res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
  }
}
